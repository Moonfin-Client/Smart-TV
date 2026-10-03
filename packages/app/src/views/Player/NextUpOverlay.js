import $L from '@enact/i18n/$L';
import {useSettings} from '../../context/SettingsContext';
import {SpottableButton} from './PlayerConstants';
import {CountdownRing, PlayGlyph, formatRemaining, useOverlayFocus} from './overlayParts';
import AnimeMarkerPills, {useEpisodeMarker, hasAnimeMarkerPills} from '../../components/AnimeMarkerPills';

import css from './NextUpOverlay.module.less';

const RING_SIZE = 32;
const RING_STROKE = 4;

// What each layout adds to the overlay. The card is the base, and the others reshape it.
const LAYOUT_CLASS = {
	card: '',
	banner: css.layoutBanner,
	button: css.layoutButton
};

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
 * thing it is about to do. The card, the banner and the button are the same prompt built three ways,
 * chosen in settings. `preview` draws it inert inside the settings screen.
 */
const NextUpOverlay = ({episode, imageUrl, serverUrl, countdown, timeout, countdownStyle, minimal, preview = false, onPlay, onDismiss}) => {
	const {settings} = useSettings();
	const layoutClass = LAYOUT_CLASS[settings.nextUpLayout] || '';
	useOverlayFocus(preview ? null : 'next-up-play-btn');
	// A preview must not put buttons in the way of the remote on the screen it sits in.
	const Button = preview ? 'div' : SpottableButton;
	const playProps = preview ? {} : {onClick: onPlay, 'data-spot-default': 'true', spotlightId: 'next-up-play-btn'};
	const dismissProps = preview ? {} : {onClick: onDismiss, spotlightId: 'next-up-dismiss-btn', 'aria-label': $L('Hide')};

	const counting = countdown != null && timeout > 0;
	const showRing = counting && (countdownStyle === 'progressBar' || countdownStyle === 'both');
	const showTimer = counting && (countdownStyle === 'timer' || countdownStyle === 'both');
	const pill = episodeLabel(episode);
	const marker = useEpisodeMarker(episode, {serverUrl});

	return (
		<div className={[preview ? css.overlayPreview : css.overlay, minimal ? css.minimal : '', layoutClass].filter(Boolean).join(' ')}>
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
					<div className={css.title}>{episode?.Name}</div>
					{showTimer && (
						<div className={css.timer}>
							{$L('Ends in {time}').replace('{time}', formatRemaining(countdown))}
						</div>
					)}
					<div className={css.actions}>
						<Button className={css.playBtn} {...playProps}>
							{showRing ? (
								<CountdownRing size={RING_SIZE} stroke={RING_STROKE} progress={countdown / timeout} classes={ringClasses}>
									<PlayGlyph className={css.ringGlyph} />
								</CountdownRing>
							) : (
								<PlayGlyph className={css.playIcon} />
							)}
							<span className={css.playLabel}>{$L('Play Next')}</span>
						</Button>
						<Button className={css.dismissBtn} {...dismissProps}>
							<svg className={css.dismissIcon} viewBox="0 0 24 24" aria-hidden="true">
								<path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
							</svg>
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default NextUpOverlay;
