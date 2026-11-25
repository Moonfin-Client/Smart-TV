import {resolvePlatformModule} from './platformModule';

// The TV's own volume, through whichever platform this is running on.

let impl = null;
let lastState = null;

const load = async () => {
	if (!impl) impl = await resolvePlatformModule('volume');
	return impl;
};

// {volume, muted} with the level from 0 to 100, or null where the set won't say.
export const getVolumeState = async () => {
	try {
		const state = await (await load()).getVolumeState();
		if (state) lastState = state;
		return state;
	} catch (e) {
		return null;
	}
};

// The last level read, for the progress reports that tell a controlling client where it is.
export const lastVolumeState = () => lastState;

export const setVolume = async (level) => {
	try {
		return await (await load()).setVolume(level);
	} catch (e) {
		return false;
	}
};

export const setMuted = async (muted) => {
	try {
		return await (await load()).setMuted(muted);
	} catch (e) {
		return false;
	}
};
