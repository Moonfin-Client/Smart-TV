import {compareVersions} from './versionChecker';

const serverVersions = new Map();

const namesNumStreams = (profile) => (profile?.ContainerProfiles || []).some((containerProfile) => (
	(containerProfile.Conditions || []).some((condition) => condition.Property === 'NumStreams')
));

const withoutNumStreams = (profile) => ({
	...profile,
	ContainerProfiles: profile.ContainerProfiles
		.map((containerProfile) => ({
			...containerProfile,
			Conditions: (containerProfile.Conditions || []).filter((condition) => condition.Property !== 'NumStreams')
		}))
		.filter((containerProfile) => containerProfile.Conditions.length)
});

const getServerVersion = async (api) => {
	const serverUrl = api?.getServerInfo?.().serverUrl;
	if (!serverUrl || !api.getPublicInfo) return null;
	if (!serverVersions.has(serverUrl)) {
		const info = await api.getPublicInfo().catch(() => null);
		if (!info?.Version) return null;
		serverVersions.set(serverUrl, info.Version);
	}
	return serverVersions.get(serverUrl);
};

// Jellyfin only learned NumStreams in 10.11, and older servers turn the whole request down with a
// 400 when a profile names it. A server that cant be asked is treated as older.
export const profileForServer = async (profile, serverType, api) => {
	if (serverType === 'emby' || serverType === 'plex' || !namesNumStreams(profile)) return profile;
	const version = await getServerVersion(api);
	return version && compareVersions(version, '10.11.0') >= 0 ? profile : withoutNumStreams(profile);
};
