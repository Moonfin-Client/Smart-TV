import {
	buildPrivateSubnetCandidates,
	extractPrivateIpv4FromSdp,
	isPrivateIpv4,
	parseIpv4
} from './serverDiscovery';

describe('parseIpv4', () => {
	test('reads four octets', () => {
		expect(parseIpv4('192.168.1.20')).toEqual([192, 168, 1, 20]);
	});

	test('rejects anything that is not four numbers in range', () => {
		expect(parseIpv4('192.168.1')).toBeNull();
		expect(parseIpv4('192.168.1.256')).toBeNull();
		expect(parseIpv4('jellyfin.local')).toBeNull();
		expect(parseIpv4('')).toBeNull();
	});
});

describe('isPrivateIpv4', () => {
	test('accepts the ranges a home network uses', () => {
		expect(isPrivateIpv4([10, 0, 0, 5])).toBe(true);
		expect(isPrivateIpv4([172, 16, 0, 5])).toBe(true);
		expect(isPrivateIpv4([172, 31, 0, 5])).toBe(true);
		expect(isPrivateIpv4([192, 168, 1, 5])).toBe(true);
		expect(isPrivateIpv4([169, 254, 1, 5])).toBe(true);
		expect(isPrivateIpv4([100, 64, 1, 5])).toBe(true);
		expect(isPrivateIpv4([127, 0, 0, 1])).toBe(true);
	});

	test('rejects addresses out on the internet', () => {
		expect(isPrivateIpv4([8, 8, 8, 8])).toBe(false);
		expect(isPrivateIpv4([172, 32, 0, 5])).toBe(false);
		expect(isPrivateIpv4([100, 128, 0, 5])).toBe(false);
	});
});

describe('extractPrivateIpv4FromSdp', () => {
	const sdp = [
		'v=0',
		'a=candidate:1 1 udp 2113937151 192.168.50.42 51234 typ host generation 0',
		'a=candidate:2 1 udp 2113937151 8.8.8.8 51235 typ srflx generation 0',
		'a=candidate:3 1 udp 2113937151 192.168.50.42 51236 typ host generation 0',
		'a=candidate:4 1 udp 2113937151 10.0.0.7 51237 typ host generation 0'
	].join('\r\n');

	test('keeps only private addresses and only once each', () => {
		expect(extractPrivateIpv4FromSdp(sdp)).toEqual([[192, 168, 50, 42], [10, 0, 0, 7]]);
	});

	test('survives an sdp with no candidates', () => {
		expect(extractPrivateIpv4FromSdp('v=0\r\n')).toEqual([]);
	});
});

describe('buildPrivateSubnetCandidates', () => {
	test('walks the subnet on both schemes and both ports, plus Plex over http, skipping our own address', () => {
		const candidates = buildPrivateSubnetCandidates({
			prefixes: {'192.168.50': true},
			currentHostByPrefix: {'192.168.50': 42},
			originScheme: 'http'
		});

		expect(candidates).toHaveLength(253 * 5);
		expect(candidates).toContain('http://192.168.50.1:8096');
		expect(candidates).toContain('https://192.168.50.1:8920');
		expect(candidates).toContain('http://192.168.50.1:32400');
		expect(candidates.some((url) => url.indexOf('192.168.50.42:') >= 0)).toBe(false);
	});

	test('an https page only reaches https servers', () => {
		const candidates = buildPrivateSubnetCandidates({
			prefixes: {'10.0.0': true},
			currentHostByPrefix: {},
			originScheme: 'https'
		});

		expect(candidates).toHaveLength(254 * 2);
		expect(candidates.every((url) => url.indexOf('https://') === 0)).toBe(true);
	});

	test('nothing to walk without a prefix', () => {
		expect(buildPrivateSubnetCandidates({
			prefixes: {},
			currentHostByPrefix: {},
			originScheme: 'http'
		})).toEqual([]);
	});
});
