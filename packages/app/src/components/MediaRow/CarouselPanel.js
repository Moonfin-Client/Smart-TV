import {memo, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {isMdblistEnabled} from '../../services/mdblistApi';
import {createApiForServer} from '../../services/jellyfinApi';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import RatingsRow from '../RatingsRow';
import {expandMs} from '../MediaCard/ModernMediaCard';
import {CAROUSEL_PANEL_SCRIM, getCardDisplayTitle, getEpisodeLabels} from '../MediaCard/modernCardLayout';
import {formatDuration, getBackdropId, getImageUrl, toAbsoluteImageUrl, videoResolutionLabel} from '../../utils/helpers';
import {channelLayout, videoCodecName} from '../../utils/mediaStreamFacts';
import {videoRangeLabel} from '../../utils/videoRange';
import {scrimStyle} from '../../utils/scrimImage';

import css from './CarouselPanel.module.less';

// Home's rows don't ask for media streams, so the panel fetches them once focus rests on a title,
// and keeps what came back.
const MEDIA_FETCH_DELAY_MS = 300;
const MEDIA_MEMORY = 200;
const mediaCache = new Map();
const rememberMedia = (key, pills) => {
	mediaCache.delete(key);
	mediaCache.set(key, pills);
	if (mediaCache.size > MEDIA_MEMORY) mediaCache.delete(mediaCache.keys().next().value);
};

const panelBackdropUrl = (item, serverUrl) => {
	const backdropId = getBackdropId(item);
	if (backdropId) return getImageUrl(serverUrl, backdropId, 'Backdrop', {maxWidth: 1280, quality: 80});
	return item._externalBackdropUrl ? toAbsoluteImageUrl(item._externalBackdropUrl, serverUrl) : null;
};

const panelInfoParts = (item) => {
	const runtime = item.Type === 'Series' ? '' : formatDuration(item.RunTimeTicks);
	const genres = (item.Genres || []).slice(0, 3);
	return [
		item.ProductionYear && {text: String(item.ProductionYear)},
		item.OfficialRating && {chip: item.OfficialRating},
		runtime && runtime !== '0m' && {text: runtime},
		genres.length > 0 && {text: genres.join(', ')}
	].filter(Boolean);
};

export const panelMediaPills = (item) => {
	const streams = item?.MediaSources?.[0]?.MediaStreams || item?.MediaStreams || [];
	const video = streams.find((stream) => stream.Type === 'Video');
	const audio = streams.find((stream) => stream.Type === 'Audio' && stream.IsDefault) || streams.find((stream) => stream.Type === 'Audio');
	const range = video ? videoRangeLabel(video) : 'SDR';
	return [
		videoResolutionLabel({MediaStreams: streams}),
		range !== 'SDR' && range,
		videoCodecName(video?.Codec),
		audio?.Codec && audio.Codec.toUpperCase(),
		channelLayout(audio?.Channels)
	].filter(Boolean);
};

const useMediaPills = (item, fetchMedia) => {
	const {api} = useAuth();
	const own = useMemo(() => panelMediaPills(item), [item]);
	const key = `${item._serverUrl || ''}|${item.Id}`;
	const wanted = fetchMedia && own.length === 0 && Boolean(item.Id) && item.MediaType === 'Video' &&
		!item._external && !item._seerr && !mediaCache.has(key);
	const [, noteFetched] = useState(0);

	useEffect(() => {
		if (!wanted) return undefined;
		let cancelled = false;
		const timer = setTimeout(() => {
			const serverApi = item._serverUrl && item._serverAccessToken
				? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId)
				: api;
			serverApi?.getItemMediaInfo?.(item.Id).then((full) => {
				rememberMedia(key, panelMediaPills(full));
				if (!cancelled) noteFetched((count) => count + 1);
			}, () => {});
		}, MEDIA_FETCH_DELAY_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [wanted, key, item, api]);

	return own.length > 0 ? own : mediaCache.get(key) || [];
};

const PanelLayer = ({item, serverUrl, hideOverview, fetchMedia = false, deferImage, className, style}) => {
	const {settings} = useSettings();
	const itemServerUrl = item._serverUrl || serverUrl;
	const backdropUrl = deferImage ? null : panelBackdropUrl(item, itemServerUrl);
	const episodeLine = item.Type === 'Episode' ? getEpisodeLabels(item)?.full || item.Name : null;
	const info = panelInfoParts(item);
	const pills = useMediaPills(item, fetchMedia);
	const overview = typeof item.Overview === 'string' ? item.Overview.trim() : '';

	return (
		<div className={[css.layer, backdropUrl ? '' : css.empty, className].filter(Boolean).join(' ')} style={style}>
			{backdropUrl && (
				<>
					<img className={css.backdrop} src={backdropUrl} alt="" decoding="async" />
					<div className={css.scrim} style={scrimStyle(CAROUSEL_PANEL_SCRIM)} />
				</>
			)}
			<div className={css.content}>
				<h3 className={css.title}>{getCardDisplayTitle(item)}</h3>
				{episodeLine && <div className={css.episode}>{episodeLine}</div>}
				{info.length > 0 && (
					<div className={css.info}>
						{info.map((part, i) => (
							<span key={i}>
								{i > 0 && <span className={css.dot}>{'•'}</span>}
								{part.chip ? <span className={css.chip}>{part.chip}</span> : part.text}
							</span>
						))}
					</div>
				)}
				<div className={css.ratings}>
					{/* The line shrinks itself to the column's width, so any width here only turns that on. */}
					<RatingsRow item={item} serverUrl={itemServerUrl} surface='homeRows' compact singleLineWidth={1} pluginEnabled={isMdblistEnabled(settings, 'homeRows')} />
				</div>
				{pills.length > 0 && (
					<div className={css.pills}>
						{pills.map((pill) => <span key={pill} className={css.pill}>{pill}</span>)}
					</div>
				)}
				{!hideOverview && overview && <p className={css.overview}>{overview}</p>}
			</div>
		</div>
	);
};

// Without an item it stands in empty, for a row still loading.
const CarouselPanel = ({item, serverUrl, hideOverview, rowFocused = false, deferImage = false}) => {
	const {settings} = useSettings();
	const fadeMs = expandMs(settings.modernCardTransitionSpeed);
	const [leaving, setLeaving] = useState(null);
	const shownRef = useRef(item);

	useLayoutEffect(() => {
		const previous = shownRef.current;
		shownRef.current = item;
		if (fadeMs && previous && item && previous.Id !== item.Id) setLeaving(previous);
	}, [item, fadeMs]);

	// Timed apart from the swap, so a refreshed copy of the same title can't leave the old one stuck.
	useEffect(() => {
		if (!leaving) return undefined;
		const timer = setTimeout(() => setLeaving(null), fadeMs);
		return () => clearTimeout(timer);
	}, [leaving, fadeMs]);

	const fade = {animationDuration: `${fadeMs}ms`};
	return (
		<div className={css.panel}>
			{!item && <div className={`${css.layer} ${css.empty}`} />}
			{leaving && <PanelLayer key={`out-${leaving.Id}`} item={leaving} serverUrl={serverUrl} hideOverview={hideOverview} deferImage={deferImage} className={css.fadeOut} style={fade} />}
			{item && <PanelLayer key={item.Id} item={item} serverUrl={serverUrl} hideOverview={hideOverview} fetchMedia={rowFocused} deferImage={deferImage} className={leaving ? css.fadeIn : ''} style={leaving ? fade : undefined} />}
		</div>
	);
};

export default memo(CarouselPanel);
