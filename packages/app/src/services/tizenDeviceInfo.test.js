import {getDeviceInfo} from '../../../platform-tizen/src/deviceInfo';

describe('Tizen device info', () => {
	afterEach(() => {
		delete global.tizen;
		delete global.webapis;
	});

	test('reports the platform version, not a number read out of the firmware string', () => {
		global.tizen = {systeminfo: {getCapability: () => '9.0'}};
		global.webapis = {productinfo: {getModel: () => 'QCQS90', getFirmware: () => 'T-PTMFDEUC-1240.1'}};
		expect(getDeviceInfo()).toMatchObject({tvVersion: '9.0', modelName: 'QCQS90'});
	});
});
