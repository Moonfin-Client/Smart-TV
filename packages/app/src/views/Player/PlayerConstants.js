import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import bookmarkIcon from '@material-symbols/svg-400/outlined/bookmark.svg?url';
import fastForwardIcon from '@material-symbols/svg-400/rounded/fast_forward.svg?url';
import fastRewindIcon from '@material-symbols/svg-400/rounded/fast_rewind.svg?url';
import favoriteIcon from '@material-symbols/svg-400/rounded/favorite.svg?url';
import infoIcon from '@material-symbols/svg-400/outlined/info.svg?url';
import musicNoteIcon from '@material-symbols/svg-400/outlined/music_note.svg?url';
import pauseIcon from '@material-symbols/svg-400/rounded/pause.svg?url';
import peopleIcon from '@material-symbols/svg-400/outlined/group.svg?url';
import playArrowIcon from '@material-symbols/svg-400/rounded/play_arrow.svg?url';
import repeatIcon from '@material-symbols/svg-400/rounded/repeat.svg?url';
import repeatOneIcon from '@material-symbols/svg-400/rounded/repeat_one.svg?url';
import shuffleIcon from '@material-symbols/svg-400/rounded/shuffle.svg?url';
import skipNextIcon from '@material-symbols/svg-400/rounded/skip_next.svg?url';
import skipPreviousIcon from '@material-symbols/svg-400/rounded/skip_previous.svg?url';
import subtitlesIcon from '@material-symbols/svg-400/outlined/subtitles.svg?url';
import fitScreenIcon from '@material-symbols/svg-400/outlined/fit_screen.svg?url';
import videoSettingsIcon from '@material-symbols/svg-400/outlined/video_settings.svg?url';

export const SpottableButton = Spottable('button');
export const SpottableDiv = Spottable('div');

export const ModalContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-selected="true"]',
	straightOnly: false,
	preserveId: true
}, 'div');

export const NextEpisodeContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-spot-default="true"]',
	straightOnly: false,
	preserveId: true
}, 'div');

export const formatTime = (seconds) => {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	if (h > 0) {
		return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}
	return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatEndTime = (remainingSeconds, clockDisplay) => {
	const now = new Date();
	now.setSeconds(now.getSeconds() + remainingSeconds);
	const hours = now.getHours();
	const minutes = now.getMinutes();
	if (clockDisplay === '12-hour') {
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const h12 = hours % 12 || 12;
		const timeString = `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
		return $L('Ends at {time}').replace('{time}', timeString);
	} else {
		const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
		return $L('Ends at {time}').replace('{time}', timeString);
	}
};

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

let _qualityPresets;
export const getQualityPresets = () => (_qualityPresets ??= [
	{label: $L('Auto'), value: null},
	{label: $L('4K (60 Mbps)'), value: 60000000, minRes: 3840},
	{label: $L('1080p (20 Mbps)'), value: 20000000, minRes: 1920},
	{label: $L('1080p (10 Mbps)'), value: 10000000, minRes: 1920},
	{label: $L('720p (8 Mbps)'), value: 8000000, minRes: 1280},
	{label: $L('720p (4 Mbps)'), value: 4000000, minRes: 1280},
	{label: $L('480p (2 Mbps)'), value: 2000000, minRes: 854},
	{label: $L('360p (1 Mbps)'), value: 1000000, minRes: 640}
]);

export const CONTROLS_HIDE_DELAY = 5000;

const MaterialIcon = ({src}) => (
	<img src={src} alt="" aria-hidden="true" />
);

export const IconPlay = () => (
	<MaterialIcon src={playArrowIcon} />
);

export const IconPause = () => (
	<MaterialIcon src={pauseIcon} />
);

export const IconRewind = () => (
	<MaterialIcon src={fastRewindIcon} />
);

export const IconForward = () => (
	<MaterialIcon src={fastForwardIcon} />
);

export const IconSubtitle = () => (
	<MaterialIcon src={subtitlesIcon} />
);

export const IconAudio = () => (
	<MaterialIcon src={musicNoteIcon} />
);

export const IconChapters = () => (
	<MaterialIcon src={bookmarkIcon} />
);

export const IconPrevious = () => (
	<MaterialIcon src={skipPreviousIcon} />
);

export const IconNext = () => (
	<MaterialIcon src={skipNextIcon} />
);

export const PlaybackRateLabel = ({value}) => (
	<span style={{fontSize: '0.62em', fontWeight: 600, lineHeight: 1}} aria-hidden="true">{`${value}x`}</span>
);

export const IconQuality = () => (
	<MaterialIcon src={videoSettingsIcon} />
);

export const IconInfo = () => (
	<MaterialIcon src={infoIcon} />
);

export const IconCast = () => (
	<MaterialIcon src={peopleIcon} />
);

export const IconZoom = () => (
	<MaterialIcon src={fitScreenIcon} />
);

export const IconShuffle = () => (
	<MaterialIcon src={shuffleIcon} />
);

export const IconRepeat = () => (
	<MaterialIcon src={repeatIcon} />
);

export const IconRepeatOne = () => (
	<MaterialIcon src={repeatOneIcon} />
);

export const IconFavorite = () => (
	<MaterialIcon src={favoriteIcon} />
);

export const IconFavoriteFilled = () => (
	<MaterialIcon src={favoriteIcon} />
);

export const parseLyricsResponse = (response) => {
	const rawLines = Array.isArray(response?.Lyrics) ? response.Lyrics : [];
	return rawLines
		.map((line) => {
			const startTicks = typeof line?.Start === 'number' ? line.Start : null;
			return {
				startSeconds: startTicks !== null ? (startTicks / 10000000) : null,
				text: (line?.Text || '').replace(/\r/g, '').trim()
			};
		})
		.filter((line) => line.text)
		.sort((a, b) => {
			const aTime = typeof a.startSeconds === 'number' ? a.startSeconds : Number.MAX_SAFE_INTEGER;
			const bTime = typeof b.startSeconds === 'number' ? b.startSeconds : Number.MAX_SAFE_INTEGER;
			return aTime - bTime;
		});
};

export const withTimeout = (promise, timeoutMs) => {
	let timeoutId;
	const timeoutPromise = new Promise((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
	});
	return Promise.race([promise, timeoutPromise]).then(
		function (val) { clearTimeout(timeoutId); return val; },
		function (err) { clearTimeout(timeoutId); throw err; }
	);
};
