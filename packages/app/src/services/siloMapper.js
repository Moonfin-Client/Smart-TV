// Silo's native answers in the Jellyfin shapes the app reads.

export const SILO_PRODUCT = 'Silo';

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// Silo's public endpoints folded into Jellyfin's PublicSystemInfo keys. The version is a git short hash such as
// "4b2e921c+dirty": shown, never parsed. Compatibility is decided by api_major.
export const siloPublicInfo = ({systemInfo, identity, branding, setup}) => {
	const wizardCompleted = setup?.wizard_completed;
	const needsSetup = setup?.needs_setup;
	const loginSubtitle = text(branding?.login_subtitle);
	return {
		Id: text(identity?.server_id),
		ServerName: text(branding?.server_name) || SILO_PRODUCT,
		Version: systemInfo.server_version,
		ProductName: SILO_PRODUCT,
		StartupWizardCompleted: typeof wizardCompleted === 'boolean'
			? wizardCompleted
			: (typeof needsSetup === 'boolean' ? !needsSetup : true),
		...(loginSubtitle ? {LoginDisclaimer: loginSubtitle} : null),
		SiloApiMajor: systemInfo.api_major,
		SiloContractDigest: systemInfo.contract_digest
	};
};

export const isSiloSystemInfo = (data) => Boolean(data) && typeof data.api_major === 'number' && typeof data.server_version === 'string';

const policyFor = (account, profile) => ({
	IsAdministrator: account?.role === 'admin' && (!profile || profile.is_primary === true),
	IsHidden: false,
	IsDisabled: false,
	EnableMediaPlayback: true,
	EnableContentDownloading: account?.download_allowed === true,
	// Personal collections are open to every Silo account.
	EnableCollectionManagement: true,
	EnableSubtitleDownloading: true,
	EnableAllFolders: true,
	EnableLiveTvAccess: false,
	EnableLiveTvManagement: false
});

// A household profile as a user. The profile is the app's user: its own progress, favorites and limits.
export const siloProfileToUser = (profile, account, configuration) => ({
	Id: String(profile.id),
	Name: text(profile.name) || account?.username || '',
	HasPassword: true,
	HasConfiguredPassword: true,
	PrimaryImageTag: profile.avatar_url ? 'silo' : null,
	SiloAccountId: account?.id != null ? String(account.id) : null,
	SiloAccount: account || null,
	SiloProfile: profile,
	Policy: policyFor(account, profile),
	...(configuration ? {Configuration: configuration} : null)
});

// The settings the app reads from a UserConfiguration, all stored at profile scope.
export const SILO_SETTING_KEYS = {
	libraryOrder: 'ui.library_order',
	disabledLibraries: 'ui.disabled_library_ids',
	audioLanguage: 'playback.audio_language',
	subtitleLanguage: 'playback.subtitle_language',
	subtitleMode: 'playback.subtitle_mode',
	showForcedSubtitles: 'playback.show_forced_subtitles',
	autoPlayNext: 'playback.auto_play_next'
};

// Silo library ids are positive integers; the app's are strings.
const libraryIds = (value) => (Array.isArray(value)
	? value.filter((id) => typeof id === 'number' && id >= 1).map((id) => String(Math.floor(id)))
	: []);

const toIntIds = (ids) => {
	const out = [];
	(ids || []).forEach((id) => {
		const n = parseInt(String(id).trim(), 10);
		if (n >= 1 && out.indexOf(n) < 0) out.push(n);
	});
	return out.length ? out : null;
};

// Silo's subtitle mode plus its separate show-forced switch, as Jellyfin's SubtitleMode.
export const siloSubtitleModeToJellyfin = (mode, showForced = true) => {
	if (mode === 'always') return 'Always';
	if (mode === 'off') return showForced ? 'OnlyForced' : 'None';
	return 'Default';
};

// Jellyfin's Default and Smart both mean Silo's auto, which has no show-forced choice of its own, so the current
// switch is kept.
export const jellyfinSubtitleModeToSilo = (mode, currentShowForced = true) => {
	switch (String(mode || '').trim().toLowerCase()) {
		case 'always': return {mode: 'always', showForced: currentShowForced};
		case 'onlyforced': return {mode: 'off', showForced: true};
		case 'none': return {mode: 'off', showForced: false};
		default: return {mode: 'auto', showForced: currentShowForced};
	}
};

export const siloSettingsToConfiguration = (values = {}) => {
	const K = SILO_SETTING_KEYS;
	const showForced = typeof values[K.showForcedSubtitles] === 'boolean' ? values[K.showForcedSubtitles] : true;
	return {
		OrderedViews: libraryIds(values[K.libraryOrder]),
		MyMediaExcludes: libraryIds(values[K.disabledLibraries]),
		LatestItemsExcludes: [],
		GroupedFolders: [],
		EnableNextEpisodeAutoPlay: typeof values[K.autoPlayNext] === 'boolean' ? values[K.autoPlayNext] : true,
		AudioLanguagePreference: text(values[K.audioLanguage]) || '',
		SubtitleLanguagePreference: text(values[K.subtitleLanguage]) || '',
		SubtitleMode: siloSubtitleModeToJellyfin(values[K.subtitleMode], showForced),
		PlayDefaultAudioTrack: true,
		RememberAudioSelections: true,
		RememberSubtitleSelections: true
	};
};

// Silo's values for a Jellyfin configuration, to compare with what was read and write back key by key.
export const configurationToSiloSettings = (config = {}, current = {}) => {
	const K = SILO_SETTING_KEYS;
	const subtitles = jellyfinSubtitleModeToSilo(config.SubtitleMode,
		typeof current[K.showForcedSubtitles] === 'boolean' ? current[K.showForcedSubtitles] : true);
	return {
		[K.libraryOrder]: toIntIds(config.OrderedViews),
		[K.disabledLibraries]: toIntIds(config.MyMediaExcludes),
		[K.audioLanguage]: text(config.AudioLanguagePreference),
		[K.subtitleLanguage]: text(config.SubtitleLanguagePreference),
		[K.subtitleMode]: subtitles.mode,
		[K.showForcedSubtitles]: subtitles.showForced,
		[K.autoPlayNext]: config.EnableNextEpisodeAutoPlay !== false
	};
};
