/**
 * Samsung Smart Hub Preview Background Service for Moonfin
 *
 * This Tizen service runs in the background and receives preview data
 * from the main application via message ports, then sets it using
 * the Samsung webapis.preview API.
 */
/* global tizen, webapis, module */

var packageId = tizen.application.getCurrentApplication().appInfo.packageId;
var applicationId = packageId + '.moonfin';
var remoteMessagePort;

/**
 * Sends a message to the main application and logs it.
 * Service logs are not easily visible, so we relay messages back to the app.
 *
 * @param {string} value - Message to send and log
 */
function logAndSend (value) {
	console.log('[SmartHub Service] ' + value);
	sendMessage(value);
}

/**
 * Sends a message to the remote message port (main application).
 *
 * @param {string} value - Message value to send
 * @param {string} [key] - Message key (defaults to "KEY")
 */
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

/**
 * Processes incoming app control data to extract and set preview data.
 */
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
