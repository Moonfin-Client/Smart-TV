// navigator.onLine only reports what the platform believes. On webOS that belief comes
// from a reachability check against LG's own servers, so a set with those domains blocked
// calls itself offline while the network and the media server answer perfectly well.
// Reaching the server is the only thing this app needs, so that's what settles it.

// Whether the app is really cut off, rather than only told that it is. A server that
// answers means the platform is wrong. With no server set up there's nothing to be cut
// off from, so the screen stays out of the way and setup reports its own errors.
//
// The probe carries the request layer's own timeout, so a server that never answers
// still comes back here as a failure.
export const confirmOffline = async ({probe, serverUrl}) => {
	if (!serverUrl) return false;
	try {
		await probe();
		return false;
	} catch {
		return true;
	}
};
