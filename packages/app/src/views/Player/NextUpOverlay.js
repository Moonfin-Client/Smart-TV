import $L from '@enact/i18n/$L';
import {SpottableButton} from './PlayerConstants';
import {CountdownRing, PlayGlyph, formatRemaining, useOverlayFocus} from './overlayParts';
import AnimeMarkerPills, {useEpisodeMarker, hasAnimeMarkerPills} from '../../components/AnimeMarkerPills';
import {airsText} from '../../utils/calendarEntries';
import {useSettings} from '../../context/SettingsContext';

import css from './NextUpOverlay.module.less';

const RING_SIZE = 32;
const RING_STROKE = 4;

const ringClasses = {ring: css.ring, svg: css.ringSvg, track: css.ringTrack, value: css.ringValue, center: css.ringCenter};

const episodeLabel = (episode) => {
	const season = episode?.ParentIndexNumber;
	const number = episode?.IndexNumber;
	if (season == null || number == null) return null;
	return `S${season}:E${number}`;
};

/**
 * Offers the next episode as the current one runs out. The ring sits inside the
 * play button rather than under the card, so the countdown reads as part of the
 * thing it is about to do. Given airDate instead, it says when the next episode
 * airs, with the close button as its only one.
 */
const NextUpOverlay = ({episode, airDate, imageUrl, serverUrl, countdown, timeout, countdownStyle, minimal, onPlay, onDismiss}) => {
	const {settings} = useSettings();
	useOverlayFocus(airDate ? 'next-up-dismiss-btn' : 'next-up-play-btn');

	const counting = !airDate && countdown != null && timeout > 0;
	const showRing = counting && (countdownStyle === 'progressBar' || countdownStyle === 'both');
	const showTimer = counting && (countdownStyle === 'timer' || countdownStyle === 'both');
	const pill = airDate ? `S${airDate.seasonNumber}:E${airDate.episodeNumber}` : episodeLabel(episode);
	const marker = useEpisodeMarker(airDate ? null : episode, {serverUrl});

	return (
		<div className={`${css.overlay} ${minimal ? css.minimal : ''}`}>
			<div className={css.card}>
				{!minimal && imageUrl && (
					<div className={css.thumb}>
						<img className={css.thumbImage} src={imageUrl} alt="" />
						<div className={css.thumbFade} />
					</div>
				)}
				<div className={css.info}>
					<div className={css.eyebrow}>{$L('Up Next')}</div>
					{(pill || hasAnimeMarkerPills(marker)) && (
						<div className={css.pills}>
							{pill && <div className={css.pill}>{pill}</div>}
							<AnimeMarkerPills marker={marker} />
						</div>
					)}
					<div className={css.title}>{airDate ? airDate.title : episode?.Name}</div>
					{airDate && <div className={css.airs}>{airsText(airDate.date, new Date(), settings.dateFormat)}</div>}
					{showTimer && (
						<div className={css.timer}>
							{$L('Ends in {time}').replace('{time}', formatRemaining(countdown))}
						</div>
					)}
					<div className={`${css.actions} ${airDate ? css.actionsEnd : ''}`}>
						{!airDate && <SpottableButton className={css.playBtn} onClick={onPlay} data-spot-default="true" spotlightId="next-up-play-btn">
							{showRing ? (
								<CountdownRing size={RING_SIZE} stroke={RING_STROKE} progress={countdown / timeout} classes={ringClasses}>
									<PlayGlyph className={css.ringGlyph} />
								</CountdownRing>
							) : (
								<PlayGlyph className={css.playIcon} />
							)}
							<span className={css.playLabel}>{$L('Play Next')}</span>
						</SpottableButton>}
						<SpottableButton className={css.dismissBtn} onClick={onDismiss} spotlightId="next-up-dismiss-btn" aria-label={$L('Hide')} data-spot-default={airDate ? 'true' : undefined}>
							<svg className={css.dismissIcon} viewBox="0 0 24 24" aria-hidden="true">
								<path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
							</svg>
						</SpottableButton>
					</div>
				</div>
			</div>
		</div>
	);
};

export default NextUpOverlay;
