import {memo, useCallback, useEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';

import {useSettings} from '../../context/SettingsContext';
import {getServerUrl} from '../../services/jellyfinApi';
import {getImageUrl} from '../../utils/helpers';
import {keepFocusInView} from '../../utils/focusScroll';
import {watchedPercent} from '../../utils/episodeBrowser';
import {ActiveTabContainer, ModalContainer} from '../../utils/spotlightContainers';
import {hidesMediaDescription} from '../Details/detailsMedia';
import {WatchedCheckIcon} from '../Details/DetailBadges';
import {SpottableButton, SpottableDiv} from './PlayerConstants';
import useSeriesEpisodes from './useSeriesEpisodes';

import css from './EpisodeBrowser.module.less';

const CURRENT_EPISODE_ID = 'episodes-current';
const stopPropagation = (e) => e.stopPropagation();

// "Season 2 · Episode 5", with a placeholder where the server has no number for it.
const episodeLine = (episode) => {
	const parts = [];
	if (episode.ParentIndexNumber != null) parts.push(`${$L('Season')} ${episode.ParentIndexNumber}`);
	parts.push(`${$L('Episode')} ${episode.IndexNumber ?? '?'}`);
	return parts.join(' · ');
};

// A long season is drawn in pieces, the first screenful at once and the rest over the next few
// frames, since building twenty rows and their stills in one go is what makes the panel hang
// on a TV. The rows are about 230px tall, so this covers what fits on screen.
const FIRST_ROWS = 5;
const ROWS_PER_FRAME = 4;

// The still is drawn 320px wide, so that is the size asked for.
const THUMB_OPTIONS = {maxWidth: 320, quality: 70};

const EpisodeRow = memo(({episode, serverUrl, isCurrent, hideOverview, onSelect}) => {
	const thumb = episode.ImageTags?.Primary
		? getImageUrl(episode._serverUrl || serverUrl, episode.Id, 'Primary', THUMB_OPTIONS)
		: null;
	const percent = watchedPercent(episode);
	const played = episode.UserData?.Played === true;

	return (
		<SpottableDiv
			className={`${css.episode} ${isCurrent ? css.episodeCurrent : ''}`}
			data-episode-id={episode.Id}
			data-selected={isCurrent ? 'true' : undefined}
			spotlightId={isCurrent ? CURRENT_EPISODE_ID : undefined}
			onClick={onSelect}
		>
			<div className={css.thumb}>
				{thumb ? (
					<img className={css.thumbImage} src={thumb} alt="" decoding="async" />
				) : (
					<div className={css.thumbPlaceholder}>
						<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 7.5l7 4.5-7 4.5z" /></svg>
					</div>
				)}
				{percent > 0 && (
					<div className={css.progressBar}>
						<div className={css.progress} style={{width: `${percent}%`}} />
					</div>
				)}
				{played && (
					<div className={css.watchedBadge}>
						<WatchedCheckIcon compact />
					</div>
				)}
			</div>
			<div className={css.body}>
				<span className={css.number}>{episodeLine(episode)}</span>
				<span className={css.title}>{episode.Name}</span>
				{episode.Overview && !hideOverview && <p className={css.overview}>{episode.Overview}</p>}
			</div>
		</SpottableDiv>
	);
});

/**
 * The Netflix style episode list over the video. The video keeps playing behind it, so this
 * only dims the picture and takes the remote. A season tab strip runs along the top and the
 * episodes of the selected season scroll underneath, each with its still, its season and
 * episode, its title, its description and how far through it you are.
 *
 * The header is the series logo, the same picture the player shows in its corner, because the
 * name the server holds can be in another language than the logo people know the show by. The
 * name only stands in where there is no logo or it would not load.
 *
 * Choosing an episode hands it to `onSelect`, which switches playback to it in place.
 */
const EpisodeBrowser = memo(({item, logoUrl, onLogoError, onSelect, onClose}) => {
	const {settings} = useSettings();
	const {seasons, selectedSeasonId, selectSeason, episodes, failed} = useSeriesEpisodes({item, enabled: true});
	const listRef = useRef(null);
	const focusedOnceRef = useRef(false);
	const serverUrl = item?._serverUrl || getServerUrl();

	// How many rows are drawn. The first batch is worked out while rendering and not in an effect,
	// so the episode that is playing is in the very first frame: everything that scrolls or focuses
	// to it afterwards needs it to exist. The batch always covers that episode, and the rest of the
	// season is then added a few rows a frame.
	const total = episodes ? episodes.length : 0;
	const playingIndex = episodes ? episodes.findIndex((candidate) => String(candidate.Id) === String(item.Id)) : -1;
	const firstBatch = Math.min(total, Math.max(FIRST_ROWS, playingIndex + 3));
	// Tied to the list it was counted for, so a season that loads later starts from its own first batch.
	const [growth, setGrowth] = useState({list: null, count: 0});
	const drawn = Math.max(firstBatch, growth.list === episodes ? growth.count : 0);
	useEffect(() => {
		if (!episodes || firstBatch >= total) return undefined;
		let frame = 0;
		let count = firstBatch;
		const grow = () => {
			count = Math.min(total, count + ROWS_PER_FRAME);
			setGrowth({list: episodes, count});
			if (count < total) frame = window.requestAnimationFrame(grow);
		};
		frame = window.requestAnimationFrame(grow);
		return () => window.cancelAnimationFrame(frame);
	}, [episodes, total, firstBatch]);

	// Once the season that is playing has loaded, the list opens scrolled to the episode that is on
	// and the remote moves to it. The scroll happens straight away, since the row is already drawn,
	// and does not wait on focus, which only lands a frame later and does not scroll by itself.
	useEffect(() => {
		if (focusedOnceRef.current || !episodes || episodes.length === 0) return;
		focusedOnceRef.current = true;
		const list = listRef.current;
		const scrollToPlaying = () => {
			const row = list && list.querySelector(`[data-episode-id="${item.Id}"]`);
			if (row) list.scrollTop = Math.max(0, row.offsetTop - 24);
			return row;
		};
		scrollToPlaying();
		window.requestAnimationFrame(() => {
			if (Spotlight.focus(CURRENT_EPISODE_ID)) {
				scrollToPlaying();
				return;
			}
			const first = list && list.querySelector('[data-episode-id]');
			if (first) Spotlight.focus(first);
		});
	}, [episodes, item.Id]);

	// The strip opens scrolled to the season that is playing, so it is on screen without having to
	// go looking for it along the row.
	const activeSeasonId = String(selectedSeasonId);
	const seasonCount = seasons ? seasons.length : 0;
	useEffect(() => {
		if (seasonCount === 0) return;
		const active = document.querySelector('[data-modal="episodes"] [data-active-tab="true"]');
		const strip = active && active.parentNode;
		if (!strip) return;
		strip.scrollLeft = Math.max(0, active.offsetLeft - ((strip.clientWidth - active.offsetWidth) / 2));
	}, [activeSeasonId, seasonCount]);

	const handleSeason = useCallback((e) => {
		selectSeason(e.currentTarget.dataset.seasonId);
	}, [selectSeason]);

	const handleEpisode = useCallback((e) => {
		const id = e.currentTarget.dataset.episodeId;
		const episode = (episodes || []).find((candidate) => String(candidate.Id) === id);
		if (episode) onSelect(episode);
	}, [episodes, onSelect]);


	return (
		<div className={css.overlay} onClick={onClose}>
			<ModalContainer className={css.panel} onClick={stopPropagation} data-modal="episodes" spotlightId="episodes-modal">
				{logoUrl ? (
					<img className={css.logo} src={logoUrl} alt={item.SeriesName || ''} onError={onLogoError} />
				) : (
					<h2 className={css.seriesName}>{item.SeriesName}</h2>
				)}
				{seasons && seasons.length > 0 && (
					<ActiveTabContainer className={css.tabs} onFocus={keepFocusInView} spotlightId="episodes-tabs">
						{seasons.map((season) => {
							const active = String(season.Id) === activeSeasonId;
							return (
								<SpottableButton
									key={season.Id}
									className={`${css.tab} ${active ? css.tabActive : ''}`}
									data-season-id={season.Id}
									data-active-tab={active ? 'true' : undefined}
									onClick={handleSeason}
								>
									{season.Name}
								</SpottableButton>
							);
						})}
					</ActiveTabContainer>
				)}
				<div className={css.list} ref={listRef} onFocus={keepFocusInView}>
					{failed && <SpottableDiv className={css.message}>{$L('Failed to load')}</SpottableDiv>}
					{!failed && episodes === null && <SpottableDiv className={css.message}>{$L('Loading...')}</SpottableDiv>}
					{!failed && episodes && episodes.length === 0 && <SpottableDiv className={css.message}>{$L('Nothing here yet.')}</SpottableDiv>}
					{!failed && episodes && episodes.slice(0, drawn).map((episode) => (
						<EpisodeRow
							key={episode.Id}
							episode={episode}
							serverUrl={serverUrl}
							isCurrent={String(episode.Id) === String(item.Id)}
							hideOverview={hidesMediaDescription(episode, settings)}
							onSelect={handleEpisode}
						/>
					))}
				</div>
				<p className={css.footer}>{$L('Press BACK to close')}</p>
			</ModalContainer>
		</div>
	);
});

export default EpisodeBrowser;
