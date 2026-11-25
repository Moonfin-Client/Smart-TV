// Every source here is a service call that can be refused, and a 4K set read as 1080p
// advertises HEVC only up to level 4.1 and sends every 4K file to the transcoder. So one
// source saying yes settles it.
export const resolvePanelType = (cfg = {}, systemProperty = {}, deviceInfo = {}) => {
	const isOled = cfg['tv.hw.displayType'] === 'OLED' ||
		(cfg['tv.model.moduleBackLightType'] || '').toLowerCase() === 'oled' ||
		systemProperty.OLED === 'true' ||
		deviceInfo.oled === true;

	const isUhd = cfg['tv.hw.panelResolution'] === 'UD' ||
		cfg['tv.hw.panelResolution'] === '8K' ||
		systemProperty.UHD === 'true' ||
		deviceInfo.uhd === true ||
		// The video plane runs at the panel's own size while the app is drawn at
		// 1080p, so a wide one here means a 4K panel behind it.
		deviceInfo.screenWidth >= 3840 ||
		// LG has never shipped an OLED below 4K.
		isOled;

	return {isUhd, isOled};
};
