// Moonfin's Smart Hub preview service. The app hands it preview data in an app control
// request, and it sets that with webapis.preview. It also relaunches the app after an
// in-app update.
/* global tizen, webapis, module */

var packageId = tizen.application.getCurrentApplication().appInfo.packageId;
var applicationId = packageId + '.moonfin';
var remoteMessagePort;

// A service's own log is hard to get at, so every line also goes to the app.
function logAndSend (value) {
	console.log('[SmartHub Service] ' + value);
	sendMessage(value);
}

function sendMessage (value, key) {
	key = key || 'KEY';
	if (remoteMessagePort === undefined) {
		try {
			remoteMessagePort = tizen.messageport.requestRemoteMessagePort(applicationId, packageId);
		} catch (e) {
			console.error('[SmartHub Service] Could not get remote message port:', e.message);
			return;
		}
	}
	if (remoteMessagePort) {
		try {
			remoteMessagePort.sendMessage([{key: key, value: value}]);
		} catch (e) {
			console.error('[SmartHub Service] Error sending message:', e.message);
		}
	} else {
		console.log('[SmartHub Service] Message port is undefined');
	}
}

function exitService () {
	tizen.application.getCurrentApplication().exit();
}

// A launch while the app is still closing would only bring that instance back.
function relaunchWhenClosed (tries) {
	var launch = function () {
		tizen.application.launch(applicationId, exitService, exitService);
	};
	try {
		tizen.application.getAppsContext(function (contexts) {
			var open = contexts.some(function (context) { return context.appId === applicationId; });
			if (open && tries < 40) {
				setTimeout(function () { relaunchWhenClosed(tries + 1); }, 250);
				return;
			}
			launch();
		}, function () {
			setTimeout(launch, 2000);
		});
	} catch (e) {
		setTimeout(launch, 2000);
	}
}

function handleDataInRequest () {
	try {
		var reqAppControl = tizen.application.getCurrentApplication().getRequestedAppControl();

		if (reqAppControl) {
			var appControlData = reqAppControl.appControl.data;

			for (var i = 0; i < appControlData.length; i++) {
				var key = appControlData[i].key;
				var value = appControlData[i].value;

				if (key === 'Preview') {
					var previewData = value;
					var previewData2 = JSON.parse(previewData);
					logAndSend('Preview Data received: ' + previewData);

					try {
						webapis.preview.setPreviewData(
							JSON.stringify(previewData2),
							function () {
								logAndSend('Preview Set!');
								tizen.application.getCurrentApplication().exit();
							},
							function (e) {
								logAndSend('PreviewData Setting failed: ' + e.message);
							}
						);
					} catch (e) {
						logAndSend('PreviewData Setting exception: ' + e.message);
					}
				} else if (key === 'Relaunch') {
					relaunchWhenClosed(0);
				} else {
					logAndSend('Unhandled key: ' + key + ', value: ' + value);
				}
			}
		}
	} catch (e) {
		logAndSend('On error exception: ' + e.message);
	}
}

module.exports.onStart = function () {
	logAndSend('Service started');
};

module.exports.onRequest = function () {
	logAndSend('Service request received');
	handleDataInRequest();
};

module.exports.onStop = function () {
	logAndSend('Service stopping...');
};

module.exports.onExit = function () {
	logAndSend('Service exiting...');
};
