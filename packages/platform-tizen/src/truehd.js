/* global webapis */

export const EXPERIMENTAL_TRUEHD_KEY = 'moonfin.experimentalTruehd';

export const isExperimentalTruehdEnabled = () => {
	if (typeof window === 'undefined') return false;
	try {
		return window.localStorage?.getItem(EXPERIMENTAL_TRUEHD_KEY) === 'true';
	} catch {
		return false;
	}
};

export const probeTruehdCodecSupport = () => {
	try {
		if (typeof webapis !== 'undefined' && typeof webapis.systeminfo?.isSupportedAudioCodec === 'function') {
			return webapis.systeminfo.isSupportedAudioCodec('TrueHD');
		}
	} catch {
		return null;
	}

	return null;
};
