import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {api as jellyfinApi, getServerUrl} from '../../services/jellyfinApi';
import {createChannelCarouselPrewarm} from '../../services/channelCarouselPrewarm';
import {setLiveTvLastChannelId} from '../../services/liveTvLastChannel';
import {channelComparator} from '../../utils/liveTvGuide';

const normalizeServer = (url) => (url || '').replace(/\/+$/, '').toLowerCase();

// The guide data and recordings only come from the signed in server, so a channel from another
// server gets no api here.
export const liveTvApiFor = (serverUrl) => (
	!serverUrl || normalizeServer(serverUrl) === normalizeServer(getServerUrl()) ? jellyfinApi : null
);

// A switch that hasn't started playing by then counts as failed.
const TUNE_TIMEOUT_MS = 35000;
const NOTICE_MS = 4000;

// Everything the live player needs for the channel carousel: the lineup to zap through, the
// guide data kept warm behind it, and opening and closing it around the OSD.
//
// The lineup is the guide's, in the guide's order, when playback started there. Anywhere else it
// is every channel in the saved sort, or just this channel when it isn't in the lineup.
//
// A channel picked in the carousel has to start playing before the carousel goes away. When it
// doesn't, the channel that was working plays again and the carousel stays up on it. The player
// reports playback starting through markChannelPlaying, and a failure through error.
const useChannelCarousel = ({item, isLiveTV, liveTvChannels, sortBy, error, controlsVisible, showControls, hideControls, setFocusRow, onSwitchChannel}) => {
	const [lineup, setLineup] = useState([]);
	const [open, setOpen] = useState(false);
	const [selectionRevision, setSelectionRevision] = useState(0);
	const [notice, setNotice] = useState(null);
	const itemRef = useRef(item);
	itemRef.current = item;
	const switchRef = useRef(null);
	const finishSwitchRef = useRef(null);
	const switchChannelRef = useRef(onSwitchChannel);
	switchChannelRef.current = onSwitchChannel;
	const lineupRef = useRef(lineup);
	lineupRef.current = lineup;
	const openRef = useRef(false);
	const priorRef = useRef({visible: false, focus: null});
	const prewarmRef = useRef(null);
	const controlsVisibleRef = useRef(controlsVisible);
	controlsVisibleRef.current = controlsVisible;
	const restoreFocusRef = useRef(null);

	// A channel from another server still gets its card, without a schedule.
	const carouselApi = useMemo(() => liveTvApiFor(item?._serverUrl), [item?._serverUrl]);

	useEffect(() => {
		if (!isLiveTV || !item?.Id) return undefined;
		if (lineupRef.current.some((channel) => channel.Id === item.Id)) return undefined;
		if (liveTvChannels?.some((channel) => channel.Id === item.Id)) {
			setLineup(liveTvChannels);
			return undefined;
		}
		if (!carouselApi) {
			setLineup([item]);
			return undefined;
		}
		let cancelled = false;
		carouselApi.getLiveTvChannels()
			.then((response) => {
				if (cancelled) return;
				const channels = [...(response?.Items || [])].sort(channelComparator(sortBy));
				setLineup(channels.some((channel) => channel.Id === item.Id) ? channels : [item]);
			})
			.catch(() => {
				if (!cancelled) setLineup([item]);
			});
		return () => {
			cancelled = true;
		};
	}, [item, isLiveTV, liveTvChannels, carouselApi, sortBy]);

	// Every tune is remembered, so the guide opens on it and back from the guide returns to it.
	useEffect(() => {
		if (isLiveTV && item?.Id && carouselApi) setLiveTvLastChannelId(item.Id);
	}, [item, isLiveTV, carouselApi]);

	useEffect(() => {
		if (!isLiveTV || !carouselApi || lineup.length < 2 || !lineup.some((channel) => channel.Id === item?.Id)) return;
		if (!prewarmRef.current) prewarmRef.current = createChannelCarouselPrewarm(carouselApi, {sortBy});
		prewarmRef.current.tuned(lineup);
	}, [item, isLiveTV, carouselApi, lineup, sortBy]);

	useEffect(() => () => {
		clearTimeout(switchRef.current?.timer);
		switchRef.current = null;
		prewarmRef.current?.dispose();
		prewarmRef.current = null;
	}, []);

	const openCarousel = useCallback(() => {
		if (openRef.current || !isLiveTV) return;
		const active = document.activeElement;
		priorRef.current = {visible: controlsVisibleRef.current, focus: active};
		// The strip takes every key while it's up, so nothing behind it should hold focus.
		if (active && active !== document.body && active.blur) active.blur();
		openRef.current = true;
		hideControls();
		setOpen(true);
	}, [hideControls, isLiveTV]);

	// Hands back to the OSD as it was, or opens it with the first control focused when Down
	// asked for the controls.
	const closeCarousel = useCallback(({revealControls = false} = {}) => {
		if (!openRef.current) return;
		openRef.current = false;
		setOpen(false);
		setNotice(null);
		const prior = priorRef.current;
		priorRef.current = {visible: false, focus: null};
		if (revealControls) {
			showControls();
			setFocusRow('bottom');
			window.requestAnimationFrame(() => Spotlight.focus('play-pause-btn'));
		} else if (prior.visible) {
			restoreFocusRef.current = prior.focus;
			showControls();
		}
	}, [setFocusRow, showControls]);

	// The player focuses its first control whenever the controls show. The control that opened
	// the carousel gets focus back a frame after that, so it wins.
	useEffect(() => {
		const focus = restoreFocusRef.current;
		if (!controlsVisible || !focus) return;
		restoreFocusRef.current = null;
		window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
			if (document.body.contains(focus)) Spotlight.focus(focus);
		}));
	}, [controlsVisible]);

	const handleDismiss = useCallback(() => closeCarousel(), [closeCarousel]);
	const handleShowControls = useCallback(() => closeCarousel({revealControls: true}), [closeCarousel]);

	// A restore has no previous channel of its own, so how it ends only ends the switch.
	const startSwitch = useCallback((target, previous) => {
		const pending = {target, previous, armed: false, staleError: null, timer: null};
		pending.timer = setTimeout(() => finishSwitchRef.current(pending, false), TUNE_TIMEOUT_MS);
		switchRef.current = pending;
		switchChannelRef.current(target);
	}, []);

	finishSwitchRef.current = (pending, succeeded) => {
		if (switchRef.current !== pending) return;
		clearTimeout(pending.timer);
		switchRef.current = null;
		if (!succeeded) setNotice({message: $L('Failed to play {name}').replace('{name}', pending.target.Name || ''), key: Date.now()});
		if (!pending.previous) return;
		if (succeeded) {
			closeCarousel();
			return;
		}
		setSelectionRevision((revision) => revision + 1);
		startSwitch(pending.previous, null);
	};

	// The error showing when the new channel takes over is left from the one before it, so only a
	// different one fails the switch. A load can start and fail between two renders, so this can't
	// wait to see the load start.
	useEffect(() => {
		const pending = switchRef.current;
		if (!pending || item?.Id !== pending.target.Id) return;
		if (!pending.armed) {
			pending.armed = true;
			pending.staleError = error;
		} else if (!error) {
			pending.staleError = null;
		} else if (error !== pending.staleError) {
			finishSwitchRef.current(pending, false);
		}
	}, [error, item]);

	const markChannelPlaying = useCallback(() => {
		const pending = switchRef.current;
		if (pending && pending.armed && itemRef.current?.Id === pending.target.Id) finishSwitchRef.current(pending, true);
	}, []);

	useEffect(() => {
		if (!notice) return undefined;
		const timer = setTimeout(() => setNotice(null), NOTICE_MS);
		return () => clearTimeout(timer);
	}, [notice]);

	// One switch at a time, and picking the channel already playing just closes the carousel.
	const handleSelect = useCallback((channel) => {
		if (!openRef.current || switchRef.current) return;
		if (channel.Id === itemRef.current?.Id) {
			closeCarousel();
			return;
		}
		startSwitch(channel, itemRef.current);
	}, [closeCarousel, startSwitch]);

	// Channel up and down zap through the same lineup without opening the carousel, and a channel that
	// fails to start hands back to the one that was playing.
	const stepChannel = useCallback((step) => {
		const channels = lineupRef.current;
		const index = channels.findIndex((channel) => channel.Id === itemRef.current?.Id);
		if (!isLiveTV || switchRef.current || index < 0 || channels.length < 2) return;
		startSwitch(channels[(index + step + channels.length) % channels.length], itemRef.current);
	}, [isLiveTV, startSwitch]);

	const carouselProps = open ? {
		prewarm: prewarmRef.current,
		api: carouselApi,
		channels: lineup.length ? lineup : [item],
		currentChannelId: item?.Id,
		selectionRevision,
		notice,
		sortBy,
		onSelect: handleSelect,
		onDismiss: handleDismiss,
		onShowControls: handleShowControls
	} : null;

	// A recording made from the player marks its card without waiting on the hourly refresh.
	const refreshRecordings = useCallback(() => prewarmRef.current?.refresh(), []);

	// The player's heart flips the channel in the lineup and in the warm guide data, so the carousel
	// and a zap back to the channel show it without a reload.
	const markChannelFavorite = useCallback((channelId, isFavorite) => {
		setLineup((channels) => channels.map((channel) => (channel.Id === channelId
			? {...channel, UserData: {...(channel.UserData || {}), IsFavorite: isFavorite}}
			: channel)));
		prewarmRef.current?.store.setChannelFavorite(channelId, isFavorite);
	}, []);

	return {carouselOpenRef: openRef, openCarousel, stepChannel, markChannelPlaying, refreshRecordings, markChannelFavorite, carouselProps};
};

export default useChannelCarousel;
