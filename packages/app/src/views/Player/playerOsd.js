import {useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import {autocropLogoUrl} from '../../utils/logoAutocrop';
import {
	IconPlay, IconPause, IconRewind, IconForward, IconSubtitle, IconSubtitleOff, IconAudio,
	IconChapters, IconEpisodes, IconPrevious, IconNext, IconQuality, IconInfo, IconCast, IconZoom,
	IconShuffle, IconRepeat, IconRepeatOne, IconSleep, IconGuide, IconChannels,
	IconFavorite, IconFavoriteFilled, IconPlaylistAdd, IconLyrics, IconQueueMusic, IconLiveRewind, IconLiveForward,
	IconLivePlay, IconLivePause, IconLiveTv, IconRecord, IconSeriesRecord, LIVE_RED
} from './PlayerConstants';
import {MARK_SKIPPED_GREY} from '../LiveTV/GuideIcons';
import {arrange, OSD_BUTTONS, OSD_ORDER_KEY, OSD_HIDDEN_KEY} from '../../utils/buttonLayout';
import {useSettings} from '../../context/SettingsContext';

// The buttons and the title logo of the player's on-screen controls, kept apart from the
// controls themselves so the Settings preview can draw the same ones without loading the player.

export const usePlayerButtons = ({
	isPaused, audioStreams, subtitleStreams, chapters,
	nextEpisode, isAudioMode, isLiveTV, liveRewind, atLive, hasNextTrack, hasPrevTrack,
	shuffleMode, repeatMode, selectedQuality,
	selectedSubtitleIndex, canDownloadRemoteSubtitles, hasCastMembers, zoomModeLabel, zoomModeKey,
	sleepMinutes, canBrowseEpisodes = false, isFavorite, hasLyrics, audioPanel, recordable, recordMark
}) => {
	const {settings} = useSettings();
	const topButtons = useMemo(() => {
		if (isAudioMode) {
			return [
				{id: 'shuffle', icon: <IconShuffle />, label: $L('Shuffle'), action: 'shuffle', active: shuffleMode},
				{id: 'previous', icon: <IconPrevious />, label: $L('Previous'), action: 'prevTrack', disabled: !hasPrevTrack && !shuffleMode},
				{id: 'playPause', icon: isPaused ? <IconPlay /> : <IconPause />, label: isPaused ? $L('Play') : $L('Pause'), action: 'playPause'},
				{id: 'next', icon: <IconNext />, label: $L('Next'), action: 'nextTrack', disabled: !hasNextTrack && repeatMode === 'off' && !shuffleMode},
				{id: 'repeat', icon: repeatMode === 'one' ? <IconRepeatOne /> : <IconRepeat />, label: $L('Repeat'), action: 'repeat', active: repeatMode !== 'off'}
			];
		}
		const buttons = [];
		if (!isLiveTV) {
			buttons.push(
				{id: 'previous', icon: <IconPrevious />, label: $L('Previous'), action: 'prevTrack'},
				{id: 'rewind', icon: <IconRewind />, label: $L('Seek back'), action: 'rewind'},
				{id: 'playPause', icon: isPaused ? <IconPlay /> : <IconPause />, label: isPaused ? $L('Play') : $L('Pause'), action: 'playPause'},
				{id: 'forward', icon: <IconForward />, label: $L('Seek forward'), action: 'forward'}
			);
			if (hasNextTrack) {
				buttons.push(
					{id: 'nextTrack', icon: <IconNext />, label: $L('Next'), action: 'nextTrack'}
				);
			} else if (nextEpisode) {
				buttons.push(
					{id: 'next', icon: <IconNext />, label: $L('Next Episode'), action: 'next'}
				);
			}
		} else {
			const playPause = {id: 'playPause', icon: isPaused ? <IconLivePlay /> : <IconLivePause />, label: isPaused ? $L('Play') : $L('Pause'), action: 'playPause'};
			buttons.push(...(liveRewind ? [
				{id: 'rewind', icon: <IconLiveRewind />, label: $L('Seek back'), action: 'rewind'},
				playPause,
				{id: 'forward', icon: <IconLiveForward />, label: $L('Seek forward'), action: 'forward'},
				{id: 'jumpToLive', icon: <IconLiveTv color={atLive ? LIVE_RED : undefined} />, label: $L('Jump to Live'), action: 'jumpToLive'}
			] : [playPause]));
		}
		return buttons;
	}, [isPaused, isAudioMode, isLiveTV, liveRewind, atLive, nextEpisode, hasNextTrack, hasPrevTrack, shuffleMode, repeatMode]);

	const osdOrder = settings[OSD_ORDER_KEY];
	const osdHidden = settings[OSD_HIDDEN_KEY];

	const bottomButtons = useMemo(() => {
		// In audio mode these flank the transport, with the track actions on the left and the panel toggles on the right.
		if (isAudioMode) {
			return [
				{id: 'favorite', icon: isFavorite ? <IconFavoriteFilled /> : <IconFavorite />, label: $L('Favorite'), action: 'favorite', active: isFavorite, side: 'start'},
				{id: 'addToPlaylist', icon: <IconPlaylistAdd />, label: $L('Add to Playlist'), action: 'addToPlaylist', side: 'start'},
				// Without lyrics Up Next is the only panel, so there's nothing to toggle.
				...(hasLyrics ? [
					{id: 'lyrics', icon: <IconLyrics />, label: $L('Lyrics'), action: 'lyrics', active: audioPanel === 'lyrics', selected: audioPanel === 'lyrics'},
					{id: 'queue', icon: <IconQueueMusic />, label: $L('Up Next'), action: 'queue', active: audioPanel === 'queue', selected: audioPanel === 'queue'}
				] : [])
			];
		}
		// Declaration order is where a button the user never placed ends up, so keep it stable.
		// The live row's order comes from moonfin-core's live player.
		if (isLiveTV) {
			return arrange([
				{id: 'channels', icon: <IconChannels />, label: $L('Channels'), action: 'channels'},
				{id: 'guide', icon: <IconGuide />, label: $L('Guide'), action: 'guide'},
				...(audioStreams.length > 1 ? [{id: 'audio', icon: <IconAudio />, label: $L('Audio'), action: 'audio'}] : []),
				...((subtitleStreams.length > 0 || canDownloadRemoteSubtitles) ? [{id: 'subtitles', icon: (selectedSubtitleIndex >= 0 ? <IconSubtitle /> : <IconSubtitleOff />), label: $L('Subtitles'), action: 'subtitle'}] : []),
				{id: 'quality', icon: <IconQuality />, label: $L('Playback Quality'), action: 'quality'},
				{id: 'zoom', icon: <IconZoom />, label: $L('Zoom').concat(` (${zoomModeLabel})`), action: 'zoom', active: zoomModeKey !== 'fit'},
				{id: 'sleep', icon: <IconSleep />, label: $L('Sleep timer'), action: 'sleep', active: sleepMinutes != null},
				...(recordable ? [{
					id: 'record',
					icon: recordMark === 'series' || recordMark === 'skipped'
						? <IconSeriesRecord color={recordMark === 'series' ? LIVE_RED : MARK_SKIPPED_GREY} />
						: <IconRecord color={recordMark === 'record' ? LIVE_RED : undefined} />,
					label: recordMark && recordMark !== 'skipped' ? $L('Cancel Recording') : $L('Record'),
					action: 'record'
				}] : []),
				{id: 'info', icon: <IconInfo />, label: $L('Playback Information'), action: 'info'}
			], {order: osdOrder, hidden: osdHidden});
		}
		return arrange([
			...(chapters.length > 0 ? [{id: 'chapters', icon: <IconChapters />, label: $L('Chapters'), action: 'chapter'}] : []),
			// Only an episode has a season to browse, so a movie never gets this button.
			...(canBrowseEpisodes ? [{id: 'episodes', icon: <IconEpisodes />, label: $L('Episodes'), action: 'episodes'}] : []),
			...((subtitleStreams.length > 0 || canDownloadRemoteSubtitles) ? [{id: 'subtitles', icon: (selectedSubtitleIndex >= 0 ? <IconSubtitle /> : <IconSubtitleOff />), label: $L('Subtitles'), action: 'subtitle'}] : []),
			...(audioStreams.length > 1 ? [{id: 'audio', icon: <IconAudio />, label: $L('Audio'), action: 'audio'}] : []),
			// Core calls this castAndCrew and keeps cast for Chromecast, so hiding one there
			// must not take the other away here.
			{id: 'castAndCrew', icon: <IconCast />, label: $L('Cast & Crew'), action: 'cast', disabled: !hasCastMembers},
			{id: 'quality', icon: <IconQuality />, label: $L('Playback Quality'), action: 'quality', active: selectedQuality != null},
			{id: 'zoom', icon: <IconZoom />, label: $L('Zoom').concat(` (${zoomModeLabel})`), action: 'zoom', active: zoomModeKey !== 'fit'},
			{id: 'sleep', icon: <IconSleep />, label: $L('Sleep timer'), action: 'sleep', active: sleepMinutes != null},
			{id: 'info', icon: <IconInfo />, label: $L('Playback Information'), action: 'info'}
		], {order: osdOrder, hidden: osdHidden, catalogue: OSD_BUTTONS});
	}, [audioStreams.length, chapters.length, canBrowseEpisodes, subtitleStreams.length, isAudioMode, isLiveTV, selectedQuality, selectedSubtitleIndex, canDownloadRemoteSubtitles, hasCastMembers, zoomModeLabel, zoomModeKey, sleepMinutes, osdOrder, osdHidden, isFavorite, hasLyrics, audioPanel, recordable, recordMark]);

	return {topButtons, bottomButtons};
};

// Mirrors the height clamp .mediaLogo sets in css (10vh, floor 70px, ceiling
// 160px) so the two stay in lockstep. It's what a logo renders at before any
// width-driven shrinking kicks in.
const LOGO_HEIGHT_VH = 0.10;
const LOGO_MIN_HEIGHT_PX = 70;
const LOGO_MAX_HEIGHT_PX = 160;
// A squarish logo comfortably clears this at the height above. A wide
// wordmark wouldn't, which is exactly the case this trims down for.
const LOGO_MAX_WIDTH_VW = 0.34;

// A logo rendered at the normal height, straight off its aspect ratio. The ratio
// is undefined until the autocrop pass resolves one, since a raw un-autocropped
// image still needs to render at something in the meantime.
const logoHeightPxFor = (aspectRatio, viewportWidth, viewportHeight) => {
	const normalHeight = Math.min(LOGO_MAX_HEIGHT_PX, Math.max(LOGO_MIN_HEIGHT_PX, viewportHeight * LOGO_HEIGHT_VH));
	if (!aspectRatio) return normalHeight;

	const maxWidth = viewportWidth * LOGO_MAX_WIDTH_VW;
	const widthAtNormalHeight = normalHeight * aspectRatio;
	return widthAtNormalHeight > maxWidth ? maxWidth / aspectRatio : normalHeight;
};

export const useOsdLogo = (logoUrl) => {
	const [logoLoadFailed, setLogoLoadFailed] = useState(false);
	const [croppedLogoUrl, setCroppedLogoUrl] = useState(null);
	const [logoAspectRatio, setLogoAspectRatio] = useState(null);

	// A tag that resolved but whose image 404s (stale cache, server hiccup) should
	// still fall back to text instead of leaving a broken image in the corner.
	// Logos vary a lot in how much transparent padding is baked into the source
	// image, so the raw url renders first and is swapped for a trimmed version
	// once the autocrop pass resolves, which keeps every logo reading the same size.
	useEffect(() => {
		setLogoLoadFailed(false);
		setCroppedLogoUrl(null);
		setLogoAspectRatio(null);
		if (!logoUrl) return undefined;
		let cancelled = false;
		autocropLogoUrl(logoUrl).then((result) => {
			if (cancelled) return;
			setCroppedLogoUrl(result?.url || null);
			setLogoAspectRatio(result?.aspectRatio || null);
		});
		return () => { cancelled = true; };
	}, [logoUrl]);

	const displayLogoUrl = croppedLogoUrl || logoUrl;

	// A wordmark-style logo (wide aspect ratio) renders far too big at the height a
	// squarish one is comfortable at, since nothing before this scaled height down
	// as width grew. See logoHeightPxFor.
	const [viewportSize, setViewportSize] = useState(() => ({width: window.innerWidth, height: window.innerHeight}));
	useEffect(() => {
		const handleResize = () => setViewportSize({width: window.innerWidth, height: window.innerHeight});
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);
	const logoHeightPx = useMemo(
		() => logoHeightPxFor(logoAspectRatio, viewportSize.width, viewportSize.height),
		[logoAspectRatio, viewportSize]
	);

	const handleLogoError = useCallback(() => {
		setLogoLoadFailed(true);
	}, []);

	return {displayLogoUrl, logoLoadFailed, logoHeightPx, handleLogoError};
};
