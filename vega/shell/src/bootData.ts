// What the shell knows about the device that the page can't find out for itself.
import {Display, HdrType} from '@amazon-devices/kepler-graphics';
import {SystemInfoModule} from '@amazon-devices/kepler-system-info';
import {fetch as fetchNetInfo} from '@amazon-devices/keplerscript-netmgr-lib';

export interface BootData {
	os: {name: string; version: string};
	display: {width: number; height: number; hdr: string[]} | null;
	ip: string | null;
}

const HDR_NAMES: Record<number, string> = {
	[HdrType.HDR10]: 'hdr10',
	[HdrType.HDR10_PLUS]: 'hdr10plus',
	[HdrType.HLG]: 'hlg',
	[HdrType.DOLBY_VISION]: 'dolbyvision'
};

const readOs = async (): Promise<BootData['os']> => {
	try {
		const info = SystemInfoModule.getSystemInfo().getOperatingSystemInfo();
		const [name, version] = await Promise.all([info.getDisplayName(), info.getVersion()]);
		return {name, version};
	} catch (e) {
		return {name: 'Vega OS', version: ''};
	}
};

const readDisplay = (): BootData['display'] => {
	try {
		const config = Display.getCurrentConfig();
		return {
			width: config.widthInPixels,
			height: config.heightInPixels,
			hdr: config.supportedHdrType.map((type) => HDR_NAMES[type]).filter(Boolean)
		};
	} catch (e) {
		return null;
	}
};

// The device's own address. The page can't learn it, since Chromium hides the
// host candidates WebRTC used to give up, and the app's server discovery walks
// the subnet from it.
const readIp = async (): Promise<string | null> => {
	try {
		const state = await fetchNetInfo();
		const details = state.details as {ipAddress?: string | null} | null;
		return details?.ipAddress || null;
	} catch (e) {
		return null;
	}
};

export const collectBootData = async (): Promise<BootData> => {
	const [os, ip] = await Promise.all([readOs(), readIp()]);
	return {os, display: readDisplay(), ip};
};
