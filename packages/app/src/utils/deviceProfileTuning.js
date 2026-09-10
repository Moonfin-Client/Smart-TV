// Applies the user's transcoding limits on top of the platform device profile.
// The platform files describe what the hardware can do, and these conditions
// describe what the user is willing to let it do, so the server transcodes
// anything past them instead of direct playing it.
//
// The panel size is a limit too. The platform files describe the decoder and
// never the screen, so a source wider than the panel is capped here even when
// the user asked for no limit.

const RESOLUTIONS = {
	res480p: {width: 720, height: 480},
	res720p: {width: 1280, height: 720},
	res1080p: {width: 1920, height: 1080},
	res2160p: {width: 3840, height: 2160}
};

// A 4K set is documented up to DCI 4K, which is wider than the 2160p the user
// can pick, so the panel gets its own size rather than one of the options.
const UHD_PANEL = {width: 4096, height: 2160};

// A reported screen size is the app's drawing surface on one platform and the
// panel on another, so the uhd flags are what this reads instead.
const panelResolution = (capabilities) => {
	if (!capabilities || capabilities.uhd8K) return null;
	return capabilities.uhd ? UHD_PANEL : RESOLUTIONS.res1080p;
};

const narrower = (left, right) => {
	if (!left) return right;
	if (!right) return left;
	return left.width <= right.width ? left : right;
};

// A format the client draws itself is asked for as a sidecar. Take it off the
// profile and the server has no way left to deliver it but to burn it into the
// video, which is what turning direct play off is asking for.
const ASS_FORMATS = ['ass', 'ssa'];
const PGS_FORMATS = ['pgs', 'pgssub'];

const resolutionConditions = ({width, height}) => ([
	{Condition: 'LessThanEqual', Property: 'Width', Value: String(width), IsRequired: false},
	{Condition: 'LessThanEqual', Property: 'Height', Value: String(height), IsRequired: false}
]);

export const applyProfileTuning = (profile, settings = {}, capabilities) => {
	if (!profile) return profile;

	const resolution = narrower(RESOLUTIONS[settings.maxVideoResolution], panelResolution(capabilities));
	const channelCap = settings.downmixToStereo === true
		? 2
		: (typeof settings.maxAudioChannels === 'number' && settings.maxAudioChannels > 0
			? settings.maxAudioChannels
			: null);
	const dropAss = settings.assDirectPlay === false;
	const dropPgs = settings.enablePgsRendering === false;

	if (!resolution && !channelCap && !dropAss && !dropPgs) return profile;

	const tuned = {...profile};

	if (resolution) {
		tuned.CodecProfiles = (tuned.CodecProfiles || []).map((codecProfile) => {
			if (codecProfile.Type !== 'Video') return codecProfile;
			return {
				...codecProfile,
				Conditions: [...(codecProfile.Conditions || []), ...resolutionConditions(resolution)]
			};
		});
		// A codec without its own profile still has to obey the cap.
		tuned.CodecProfiles = [
			...tuned.CodecProfiles,
			{Type: 'Video', Conditions: resolutionConditions(resolution)}
		];
		// The conditions above decide whether to transcode. These decide how big
		// the transcode comes out, which the server otherwise works out only when
		// the video stream is what sent it to the transcoder.
		tuned.TranscodingProfiles = (tuned.TranscodingProfiles || []).map((transcodingProfile) => {
			if (transcodingProfile.Type !== 'Video') return transcodingProfile;
			return {
				...transcodingProfile,
				Conditions: [...(transcodingProfile.Conditions || []), ...resolutionConditions(resolution)]
			};
		});
	}

	if (channelCap) {
		const capCondition = {
			Condition: 'LessThanEqual', Property: 'AudioChannels', Value: String(channelCap), IsRequired: false
		};
		tuned.CodecProfiles = [
			...(tuned.CodecProfiles || []),
			{Type: 'VideoAudio', Conditions: [capCondition]},
			{Type: 'Audio', Conditions: [capCondition]}
		];
		tuned.TranscodingProfiles = (tuned.TranscodingProfiles || []).map((transcodingProfile) => {
			const existing = parseInt(transcodingProfile.MaxAudioChannels, 10);
			const capped = isNaN(existing) ? channelCap : Math.min(existing, channelCap);
			return {...transcodingProfile, MaxAudioChannels: String(capped)};
		});
	}

	if (dropAss || dropPgs) {
		const dropped = [...(dropAss ? ASS_FORMATS : []), ...(dropPgs ? PGS_FORMATS : [])];
		tuned.SubtitleProfiles = (tuned.SubtitleProfiles || [])
			.filter((subtitleProfile) => dropped.indexOf(subtitleProfile.Format) < 0);
	}

	return tuned;
};
