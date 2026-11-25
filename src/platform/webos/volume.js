// The TV's own volume. LG documents only a step up, a step down and mute for apps, so a level is
// reached by stepping from the one the set reports. It reports it through a getVolume it answers
// but doesn't document, flat on older firmware and under volumeStatus on newer.

const request = async (method, parameters = {}) => {
	const LS2Request = (await import('./LS2Request.js')).default;
	return new Promise((resolve, reject) => {
		new LS2Request().send({
			service: 'luna://com.webos.audio',
			method,
			parameters,
			onSuccess: resolve,
			onFailure: (err) => reject(new Error((err && err.errorText) || `${method} failed`))
		});
	});
};

// The level from 0 to 100 and whether the set is muted, or null where the set won't say.
export const getVolumeState = async () => {
	try {
		const res = await request('getVolume');
		const status = res.volumeStatus || {};
		const volume = Number(res.volume != null ? res.volume : status.volume);
		if (!isFinite(volume)) return null;
		const muted = [res.muted, res.mute, status.muteStatus].some((flag) => flag === true);
		return {volume, muted};
	} catch (e) {
		return null;
	}
};

export const setVolume = async (level) => {
	const state = await getVolumeState();
	if (!state) return false;
	const target = Math.round(level);
	const method = target > state.volume ? 'volumeUp' : 'volumeDown';
	try {
		for (let steps = Math.abs(target - state.volume); steps > 0; steps--) {
			await request(method);
		}
		return true;
	} catch (e) {
		return false;
	}
};

export const setMuted = async (muted) => {
	try {
		await request('setMuted', {muted});
		return true;
	} catch (e) {
		return false;
	}
};
