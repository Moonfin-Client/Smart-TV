// The synced switch still turns card previews on and off, so an app that only knows the switch
// keeps working, and the mode picks what plays once they're on.
export const mediaPreviewMode = (settings) => {
	if (!settings || !settings.episodePreviewEnabled) return 'off';
	return settings.mediaPreviewMode === 'trailer' ? 'trailer' : 'media';
};

export const mediaPreviewSettings = (mode) => ({
	episodePreviewEnabled: mode !== 'off',
	mediaPreviewMode: mode
});
