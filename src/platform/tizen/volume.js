/* global tizen */

// The TV's own volume. AVPlay has no level of its own, so the set's is the one a remote moves.

const audioControl = () => {
	try {
		return typeof tizen !== 'undefined' && tizen.tvaudiocontrol ? tizen.tvaudiocontrol : null;
	} catch (e) {
		return null;
	}
};

// The level from 0 to 100 and whether the set is muted, or null where there's no volume to read.
export const getVolumeState = async () => {
	const control = audioControl();
	if (!control) return null;
	try {
		return {volume: control.getVolume(), muted: control.isMute()};
	} catch (e) {
		return null;
	}
};

export const setVolume = async (level) => {
	const control = audioControl();
	if (!control) return false;
	try {
		control.setVolume(Math.round(level));
		return true;
	} catch (e) {
		return false;
	}
};

export const setMuted = async (muted) => {
	const control = audioControl();
	if (!control) return false;
	try {
		control.setMute(muted);
		return true;
	} catch (e) {
		return false;
	}
};
