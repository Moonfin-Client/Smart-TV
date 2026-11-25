import {resolvePlatformModule} from './platformModule';
import {profileForServer} from './profileForServer';

let impl;

const loadImpl = async () => {
	if (impl) return impl;
	impl = await resolvePlatformModule('deviceProfile');
	return impl;
};

export const getDeviceCapabilities = async (...args) => {
	await loadImpl();
	return impl.getDeviceCapabilities(...args);
};

// Jellyfin and Emby share the DirectPlay, Transcoding and Subtitle profile schema (Emby
// started it), so both start from the same profile and anything the target server can't
// read is trimmed here.
export const getDeviceProfile = async (serverType, options, api) => {
	await loadImpl();
	return profileForServer(await impl.getJellyfinDeviceProfile(options), serverType, api);
};

export const getH264FallbackProfile = async (...args) => {
	await loadImpl();
	return impl.getH264FallbackProfile ? impl.getH264FallbackProfile(...args) : impl.getJellyfinDeviceProfile(...args);
};

export const clearCapabilitiesCache = () => {
	impl?.clearCapabilitiesCache?.();
};
