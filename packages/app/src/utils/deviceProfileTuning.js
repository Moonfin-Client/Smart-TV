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

// The name a picked codec is stored under, for every label a profile or a stream gives it.
const transcodableAudioCodecOf = (codec) => {
	const name = String(codec || '').trim().toLowerCase();
	if (name === 'aac_latm') return 'aac';
	if (name === 'dca' || name === 'dtshd' || name === 'dts-hd') return 'dts';
	if (name === 'mlp') return 'truehd';
	if (name === 'wav' || name.startsWith('pcm')) return 'pcm';
	return name;
};

// Whether the user has the server convert this audio codec instead of the TV playing it.
export const transcodesAudioCodec = (settings, codec) =>
	(settings?.transcodeAudioCodecs || []).includes(transcodableAudioCodecOf(codec));

// Whether a streamed transcode has another format to convert this one into. One with nowhere
// else to go is copied, so picking it would only cost a remux.
export const canTranscodeAudioCodecAway = (profile, codec) =>
	(profile?.TranscodingProfiles || []).some((transcodingProfile) =>
		transcodingProfile.Type === 'Video' && transcodingProfile.Context === 'Streaming' &&
		String(transcodingProfile.AudioCodec || '').split(',').some((name) => transcodableAudioCodecOf(name) !== codec));

const resolutionConditions = ({width, height}) => ([
	{Condition: 'LessThanEqual', Property: 'Width', Value: String(width), IsRequired: false},
	{Condition: 'LessThanEqual', Property: 'Height', Value: String(height), IsRequired: false}
]);

// A cap is a landscape box, but a portrait source is the same box turned on its side.
// Conditions can't swap width and height, so it goes out as two profiles and the source's
// width picks one. A source no wider than the short side is portrait and gets the long side.
const orientedResolutionProfiles = ({width, height}) => {
	const long = Math.max(width, height);
	const short = Math.min(width, height);
	return [
		{
			Type: 'Video',
			ApplyConditions: [{Condition: 'GreaterThanEqual', Property: 'Width', Value: String(short + 1), IsRequired: false}],
			Conditions: resolutionConditions({width: long, height: short})
		},
		{
			Type: 'Video',
			ApplyConditions: [{Condition: 'LessThanEqual', Property: 'Width', Value: String(short), IsRequired: false}],
			Conditions: [{Condition: 'LessThanEqual', Property: 'Height', Value: String(long), IsRequired: false}]
		}
	];
};

export const applyProfileTuning = (profile, settings = {}, capabilities, {isLiveTV = false} = {}) => {
	if (!profile) return profile;

	const resolution = narrower(RESOLUTIONS[settings.maxVideoResolution], panelResolution(capabilities));
	const channelCap = settings.downmixToStereo === true
		? 2
		: (typeof settings.maxAudioChannels === 'number' && settings.maxAudioChannels > 0
			? settings.maxAudioChannels
			: null);
	const dropAss = settings.assDirectPlay === false;
	const dropPgs = settings.enablePgsRendering === false;
	const transcodeAudio = (settings.transcodeAudioCodecs || []).length > 0;

	if (!resolution && !channelCap && !dropAss && !dropPgs && !transcodeAudio) return profile;

	const tuned = {...profile};

	if (resolution) {
		// A profile with no codec applies to every codec, so the cap reaches those without a profile of their own.
		tuned.CodecProfiles = [...(tuned.CodecProfiles || []), ...orientedResolutionProfiles(resolution)];
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

	// Only video loses the picks, so music still direct plays. An empty list means any codec,
	// so a direct play entry left empty goes. A streamed transcode left empty goes too while
	// another can still convert, since the server prefers whichever can copy the source audio.
	// Live TV only takes the TS profile, so there, or when nothing else can convert, it keeps
	// its list and the server copies that audio.
	if (transcodeAudio) {
		const kept = (codecs) => codecs.split(',').filter((codec) => !transcodesAudioCodec(settings, codec)).join(',');
		tuned.DirectPlayProfiles = (tuned.DirectPlayProfiles || [])
			.map((directPlayProfile) => {
				if (directPlayProfile.Type !== 'Video' || !directPlayProfile.AudioCodec) return directPlayProfile;
				const codecs = kept(directPlayProfile.AudioCodec);
				return codecs ? {...directPlayProfile, AudioCodec: codecs} : null;
			})
			.filter(Boolean);
		const filtered = (tuned.TranscodingProfiles || []).map((transcodingProfile) => ({
			transcodingProfile,
			codecs: transcodingProfile.Type === 'Video' && transcodingProfile.AudioCodec ? kept(transcodingProfile.AudioCodec) : null
		}));
		const streamedCanConvert = filtered.some(({transcodingProfile, codecs}) => transcodingProfile.Context === 'Streaming' && codecs);
		tuned.TranscodingProfiles = filtered
			.filter(({transcodingProfile, codecs}) => codecs !== '' || isLiveTV || !streamedCanConvert || transcodingProfile.Context !== 'Streaming')
			.map(({transcodingProfile, codecs}) => (codecs ? {...transcodingProfile, AudioCodec: codecs} : transcodingProfile));
	}

	if (dropAss || dropPgs) {
		const dropped = [...(dropAss ? ASS_FORMATS : []), ...(dropPgs ? PGS_FORMATS : [])];
		tuned.SubtitleProfiles = (tuned.SubtitleProfiles || [])
			.filter((subtitleProfile) => dropped.indexOf(subtitleProfile.Format) < 0);
	}

	return tuned;
};

const isVideoHls = (entry) => entry.Type === 'Video' && String(entry.Protocol).toLowerCase() === 'hls';
const isTsVideoHls = (entry) => isVideoHls(entry) && String(entry.Container).toLowerCase() === 'ts';

// Emby's live HLS only works in MPEG-TS segments. In fMP4 its playlist gives every segment a zero
// length and no init section. The server takes the first entry it can satisfy, so a live channel
// on Emby gets the TS entries moved ahead of fMP4, or a TS copy of the fMP4 one where a platform
// offers only fMP4. The copy stops at 5.1, since TS cant carry AAC past that.
export const preferMpegTsHlsForLive = (profile) => {
	const entries = profile?.TranscodingProfiles;
	if (!Array.isArray(entries)) return profile;
	const first = entries.findIndex(isVideoHls);
	if (first === -1 || isTsVideoHls(entries[first])) return profile;
	const tsEntries = entries.filter(isTsVideoHls);
	const lead = tsEntries.length ? tsEntries : [{
		...entries[first],
		Container: 'ts',
		...(Number(entries[first].MaxAudioChannels) > 6 ? {MaxAudioChannels: '6'} : {})
	}];
	const others = entries.filter((entry) => !isTsVideoHls(entry));
	return {...profile, TranscodingProfiles: [...others.slice(0, first), ...lead, ...others.slice(first)]};
};
