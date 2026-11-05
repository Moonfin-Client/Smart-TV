/**
 * Moonfin webOS network proxy service.
 *
 * Runs in the TV's Node.js runtime, OUTSIDE the WebView's TLS stack, so it can
 * carry an up-to-date CA bundle. The WebView on older webOS TVs rejects
 * Let's-Encrypt-secured servers (net::ERR_INSECURE_RESPONSE) because the system
 * root-CA store predates the current Let's Encrypt roots. The app falls back to
 * this service for those servers; see packages/app/src/services/secureFetch.js.
 *
 * Method: luna://org.moonfin.webos.service/fetch
 *   params: { url, method, headers, body, timeoutMs, insecure }
 *   reply (success): { returnValue: true, status, headers, body }
 *   reply (failure): { returnValue: false, errorText, errorClass: 'cert'|'network' }
 */
/* eslint-disable */
var Service = require('webos-service');
var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var path = require('path');
var tls = require('tls');

var service = new Service('org.moonfin.webos.service');

// Build a CA list = bundled Let's Encrypt roots + Node's built-in roots (when
// the runtime exposes them). Passing `ca` replaces the default trust list, so
// we must re-add the defaults or we'd lose trust for every other CA.
var EXTRA_CA = [];
try {
	var bundle = fs.readFileSync(path.join(__dirname, 'certs', 'ca-bundle.pem'), 'utf8');
	// Split a concatenated PEM into individual certificates.
	var matches = bundle.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
	EXTRA_CA = matches;
} catch (e) {
	console.error('[moonfin-proxy] could not read ca-bundle.pem:', e.message);
}

function buildCaList () {
	var list = EXTRA_CA.slice();
	if (tls.rootCertificates && tls.rootCertificates.length) {
		list = list.concat(tls.rootCertificates);
	}
	return list;
}

// The trust list is constant, so compute it once at startup.
var CA_LIST = buildCaList();

var SECURE_CONTEXT = null;
if (!(tls.rootCertificates && tls.rootCertificates.length)) {
	SECURE_CONTEXT = tls.createSecureContext();
	EXTRA_CA.forEach(function (pem) { SECURE_CONTEXT.context.addCACert(pem); });
}

var CERT_ERROR_CODES = {
	UNABLE_TO_GET_ISSUER_CERT: 1,
	UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 1,
	UNABLE_TO_VERIFY_LEAF_SIGNATURE: 1,
	CERT_HAS_EXPIRED: 1,
	CERT_NOT_YET_VALID: 1,
	DEPTH_ZERO_SELF_SIGNED_CERT: 1,
	SELF_SIGNED_CERT_IN_CHAIN: 1,
	ERR_TLS_CERT_ALTNAME_INVALID: 1,
	CERT_UNTRUSTED: 1
};

function isCertError (err) {
	if (!err) return false;
	if (err.code && CERT_ERROR_CODES[err.code]) return true;
	var msg = String(err.message || '');
	return /certificate|self signed|self-signed|unable to verify|ERR_TLS/i.test(msg);
}

function doRequest (params, message) {
	var target;
	try {
		target = url.parse(params.url);
	} catch (e) {
		message.respond({returnValue: false, errorText: 'Invalid URL', errorClass: 'network'});
		return;
	}

	var isHttps = target.protocol === 'https:';
	var lib = isHttps ? https : http;

	var options = {
		protocol: target.protocol,
		hostname: target.hostname,
		port: target.port || (isHttps ? 443 : 80),
		path: (target.path || '/'),
		method: params.method || 'GET',
		headers: params.headers || {}
	};

	if (isHttps) {
		if (params.insecure) {
			options.rejectUnauthorized = false;
		} else if (SECURE_CONTEXT) {
			options.secureContext = SECURE_CONTEXT;
			options.rejectUnauthorized = true;
		} else {
			options.ca = CA_LIST;
			options.rejectUnauthorized = true;
		}
		// Old TV runtimes need SNI explicitly for vhosts behind a load balancer.
		options.servername = target.hostname;
	}

	var settled = false;
	var finish = function (payload) {
		if (settled) return;
		settled = true;
		try {
			message.respond(payload);
		} catch (e) {
			console.error('[moonfin-proxy] respond failed:', e.message);
		}
	};

	var req = lib.request(options, function (res) {
		var chunks = [];
		res.on('data', function (c) { chunks.push(c); });
		res.on('end', function () {
			var body = Buffer.concat(chunks).toString('utf8');
			finish({
				returnValue: true,
				status: res.statusCode,
				headers: res.headers || {},
				body: body
			});
		});
	});

	var timeoutMs = params.timeoutMs || 15000;
	req.setTimeout(timeoutMs, function () {
		req.abort();
	});

	req.on('error', function (err) {
		finish({
			returnValue: false,
			errorText: err.message || 'Request failed',
			errorClass: isCertError(err) ? 'cert' : 'network'
		});
	});

	if (params.body != null) {
		req.write(typeof params.body === 'string' ? params.body : JSON.stringify(params.body));
	}
	req.end();
}

service.register('fetch', function (message) {
	var params = message.payload || {};
	if (!params.url) {
		message.respond({returnValue: false, errorText: 'Missing url', errorClass: 'network'});
		return;
	}
	try {
		doRequest(params, message);
	} catch (e) {
		message.respond({returnValue: false, errorText: e.message, errorClass: 'network'});
	}
});
