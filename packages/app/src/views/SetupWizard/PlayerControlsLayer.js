// The player's subtitle line and on-screen controls for the settings preview, drawn with the
// player's own code and stylesheet. It's loaded the first time the player scene shows, so the
// player's styles don't load with the app.

import {useSettings} from '../../context/SettingsContext';
import {usePlayerButtons, useOsdLogo} from '../Player/playerOsd';
import SubtitleTextOverlay from '../Player/SubtitleTextOverlay';
import {getZoomModeOptions} from '../Settings/settingsOptions';
import {chapterMarkerPositions} from '../../utils/chapterMarkers';
import {formatPlaybackTimeSlot} from '../../utils/playbackTimeLabels';
import {zoomInternalFromSetting, zoomSettingFromInternal} from '../../utils/playbackTuning';
import {resolveSubtitleStyleSettings} from '../../utils/subtitleConstants';
// The webOS player's controls and subtitles share these rules.
import playerCss from '../Player/TizenPlayer.module.less';

const SUBTITLE_LINES = {
	jpn: '待って、今の聞こえた？',
	spa: 'Espera, ¿oíste eso?',
	fre: 'Attends, tu as entendu ça ?',
	fra: 'Attends, tu as entendu ça ?',
	ger: 'Warte, hast du das gehört?',
	deu: 'Warte, hast du das gehört?'
};

// The episode the player scene plays, with everything its controls check for: chapters, a
// season to browse, a subtitle track, a second audio track, a cast and a next episode.
const SAMPLE_DURATION = 2640;
const SAMPLE_CHAPTERS = [0, 0.18, 0.47, 0.81].map((share) => ({startPositionTicks: Math.round(share * SAMPLE_DURATION) * 10000000}));
const SAMPLE_AUDIO = [{index: 1}, {index: 2}];
const SAMPLE_SUBTITLES = [{index: 3}];

// What the player's stylesheet gives the focused control, since nothing in the preview takes focus.
const FOCUSED_BUTTON = {backgroundColor: 'rgba(255, 255, 255, 0.22)', borderColor: '#FFFFFF'};

// The player's on-screen controls for the sample episode, built from the same buttons, logo and
// time labels the player uses. [focus] is what holds the remote, the play button or the bar.
const PlayerOsd = ({item, paused, subtitles, progress, focus, measureBar}) => {
	const {settings} = useSettings();
	const zoomKey = zoomInternalFromSetting(settings.playerZoomMode);
	const zoomOption = getZoomModeOptions().find((option) => option.value === zoomSettingFromInternal(zoomKey));
	const {topButtons, bottomButtons} = usePlayerButtons({
		isPaused: paused, audioStreams: SAMPLE_AUDIO, subtitleStreams: SAMPLE_SUBTITLES, chapters: SAMPLE_CHAPTERS,
		nextEpisode: true, isAudioMode: false, isLiveTV: false, selectedQuality: null,
		selectedSubtitleIndex: subtitles ? SAMPLE_SUBTITLES[0].index : -1, canDownloadRemoteSubtitles: true, hasCastMembers: true,
		zoomModeLabel: zoomOption && zoomOption.label, zoomModeKey: zoomKey, sleepMinutes: null, canBrowseEpisodes: true
	});
	const {displayLogoUrl, logoLoadFailed, logoHeightPx, handleLogoError} = useOsdLogo(item && item.logoUrl);
	const title = item ? item.title : '';
	const episode = 'S1:E1 - Pilot';
	const position = progress * SAMPLE_DURATION;
	const timeArgs = {position, duration: SAMPLE_DURATION, clockDisplay: settings.clockDisplay, timeOffsetHours: settings.timeOffsetHours};
	const slots = (keys) => keys.map((key) => formatPlaybackTimeSlot({slot: settings[key], ...timeArgs}));
	const above = slots(['playbackTimeAboveLeft', 'playbackTimeAboveCenter', 'playbackTimeAboveRight']);
	const below = slots(['playbackTimeBelowLeft', 'playbackTimeBelowCenter', 'playbackTimeBelowRight']);
	const marks = settings.showChapterMarkers ? chapterMarkerPositions(SAMPLE_CHAPTERS, SAMPLE_DURATION * 1000) : [];
	const timeRow = (texts, rowClass, textClass) => texts.some((text) => text !== '') && (
		<div className={rowClass}>
			<span className={`${textClass} ${playerCss.timeSlotCell} ${playerCss.timeSlotLeft}`}>{texts[0]}</span>
			<span className={`${textClass} ${playerCss.timeSlotCell} ${playerCss.timeSlotCenter}`}>{texts[1]}</span>
			<span className={`${textClass} ${playerCss.timeSlotCell} ${playerCss.timeSlotRight}`}>{texts[2]}</span>
		</div>
	);
	const button = (btn) => {
		const focused = focus === 'button' && btn.id === 'playPause';
		return (
			<div key={btn.id} className={playerCss.controlBtnWrapper}>
				<div
					className={`${playerCss.controlBtn} ${btn.disabled ? playerCss.controlBtnDisabled : ''} ${btn.active ? playerCss.controlBtnActive : ''}`}
					style={focused ? FOCUSED_BUTTON : null}
				>
					{btn.icon}
				</div>
				<div className={playerCss.focusTooltip} style={focused ? {opacity: 1} : null}>{btn.label}</div>
			</div>
		);
	};
	return (
		<div className={`${playerCss.playerControls} ${playerCss.visible}`}>
			<div className={playerCss.controlsTop}>
				<div className={playerCss.mediaInfo}>
					{displayLogoUrl && !logoLoadFailed ? (
						<>
							<img className={playerCss.mediaLogo} style={{height: `${logoHeightPx}px`}} src={displayLogoUrl} alt={title} onError={handleLogoError} />
							<h1 className={playerCss.mediaTitle}>{episode}</h1>
						</>
					) : (
						<>
							<p className={playerCss.mediaSecondary}>{title}</p>
							<h1 className={playerCss.mediaTitle}>{episode}</h1>
						</>
					)}
				</div>
			</div>
			<div className={playerCss.controlsBottom}>
				<div className={playerCss.progressContainer}>
					{timeRow(above, playerCss.timeInfoTop, playerCss.timeEnd)}
					<div ref={measureBar} className={playerCss.progressBar}>
						<div className={playerCss.progressFill} style={{transform: `scaleX(${progress})`, WebkitTransform: `scaleX(${progress})`}} />
						<div className={playerCss.seekIndicator} style={{left: `${progress * 100}%`, ...(focus === 'progress' ? {backgroundColor: '#FFFFFF'} : null)}} />
						{marks.map((ms) => (
							<div key={ms} className={playerCss.chapterMark} style={{left: `${(ms / (SAMPLE_DURATION * 1000)) * 100}%`}} />
						))}
					</div>
					{timeRow(below, playerCss.timeInfo, playerCss.timeDisplay)}
				</div>
				<div className={playerCss.videoControlsRow}>
					<div className={playerCss.transportButtons}>{topButtons.map(button)}</div>
					{bottomButtons.length > 0 && <div className={playerCss.controlButtonsBottom}>{bottomButtons.map(button)}</div>}
				</div>
			</div>
		</div>
	);
};

const PlayerControlsLayer = ({item, hdr, subtitles, controls, paused, progress, focus, measureBar}) => {
	const {settings} = useSettings();
	return (
		<>
			{subtitles && (
				<SubtitleTextOverlay
					css={playerCss}
					settings={resolveSubtitleStyleSettings(settings, hdr)}
					primaryText={SUBTITLE_LINES[settings.subtitleLanguage] || 'Wait, did you hear that?'}
				/>
			)}
			{controls && (
				<PlayerOsd item={item} paused={paused} subtitles={subtitles} progress={progress} focus={focus} measureBar={measureBar} />
			)}
		</>
	);
};

export default PlayerControlsLayer;
