import $L from '@enact/i18n/$L';

import {DETAIL_HIDDEN_KEY, hiddenSet} from '../../../utils/buttonLayout';
import {formatDuration, getImageUrl} from '../../../utils/helpers';

// The item types Stage draws. Everything else, a person, an album or a collection, goes to Modern,
// which already knows how to lay those out.
const STAGE_TYPES = ['Movie', 'Series', 'Season', 'Episode', 'Video', 'MusicVideo'];

export const drawsStage = (type) => STAGE_TYPES.indexOf(type) >= 0;

// Play, three circles and the ellipsis are what fit under the poster, so that's the most the row
// shows whatever the button count setting says.
export const STAGE_BUTTON_CAP = 5;

// The page sits on the picture rather than beside it, so the darkening keeps a floor even with the
// opacity slider at the bottom.
export const stageScrimAlpha = (blurAmount) =>
	0.55 + Math.min(1, Math.max(0, Number(blurAmount ?? 20) / 25)) * 0.3;

const SERIES_PART = ['Season', 'Episode'];

// The poster and whether it's a wide still. With series thumbnails on, an episode keeps its still out
// of sight and shows its show's poster, and a season without a poster of its own borrows the show's
// too. An episode's or a video's own picture is wide, so it keeps its shape rather than being
// cropped into a poster.
export const stagePoster = (serverUrl, item, settings) => {
	if (item._externalPosterUrl) return {url: item._externalPosterUrl, wide: false};
	const own = item.ImageTags?.Primary;
	const seriesTag = SERIES_PART.indexOf(item.Type) >= 0 && item.SeriesId ? item.SeriesPrimaryImageTag : null;
	const spoilerFree = item.Type === 'Episode' && settings?.detailUseSeriesThumbnails;
	if (seriesTag && (spoilerFree || !own)) {
		return {url: getImageUrl(serverUrl, item.SeriesId, 'Primary', {maxHeight: 900, quality: 90, tag: seriesTag}), wide: false};
	}
	const wide = item.Type === 'Episode' || item.Type === 'Video';
	return {url: own ? getImageUrl(serverUrl, item.Id, 'Primary', {maxWidth: 720, quality: 90, tag: own}) : null, wide};
};

// An episode's place in its show, like S1:E2.
export const episodeCode = (item) => (item.ParentIndexNumber != null && item.IndexNumber != null
	? `S${item.ParentIndexNumber}:E${item.IndexNumber}`
	: null);

// How far into the title the viewer is, or for a show into the episode it would resume, and the line
// beside the bar. Null when there's nowhere to resume.
export const resumeLine = (item, nextUp) => {
	const target = item.Type === 'Series' ? nextUp?.[0] : item;
	const runtime = target?.RunTimeTicks;
	const position = target?.UserData?.PlaybackPositionTicks;
	if (!target || target.UserData?.Played || !(runtime > 0) || !(position > 0) || position >= runtime) return null;
	const left = $L('{time} remaining').replace('{time}', formatDuration(runtime - position));
	return {
		percent: (position / runtime) * 100,
		label: [target === item ? null : episodeCode(target), left].filter(Boolean).join(' · ')
	};
};

// The line under the show's name on a season or an episode.
export const stageSubtitle = (item) => {
	if (item.Type === 'Season') return item.Name || '';
	if (item.Type !== 'Episode') return '';
	return [episodeCode(item), item.Name].filter(Boolean).join(' · ');
};

const streamName = (stream) => stream?.DisplayTitle || stream?.Language || $L('Unknown');

// The audio, subtitle and version pickers with what each is set to, for the chips beside the poster.
// A picker is offered on the same terms its button would be, and one the viewer hid from the button
// row stays hidden here too.
export const stageTrackChoices = ({
	settings, seerrOnly, mediaSource, selectedAudioIndex, selectedSubtitleIndex,
	hasMultipleAudio, hasMultipleVersions, supportsMediaSourceSelection
}) => {
	if (seerrOnly || !supportsMediaSourceSelection) return [];
	const hidden = hiddenSet(settings?.[DETAIL_HIDDEN_KEY]);
	const streams = mediaSource?.MediaStreams || [];
	const audio = streams.filter((stream) => stream.Type === 'Audio');
	const subtitles = streams.filter((stream) => stream.Type === 'Subtitle');
	const subtitle = selectedSubtitleIndex >= 0 ? subtitles[selectedSubtitleIndex] : null;

	const choices = [];
	if (hasMultipleAudio && !hidden.has('audio')) {
		choices.push({id: 'audio', current: streamName(audio[selectedAudioIndex] || audio[0])});
	}
	if (!hidden.has('subtitles')) {
		choices.push({id: 'subtitles', current: subtitle ? streamName(subtitle) : $L('None')});
	}
	if (hasMultipleVersions && !hidden.has('version')) {
		choices.push({id: 'version', current: mediaSource?.Name || $L('Unknown')});
	}
	return choices;
};

// Stand ins for the two places a press can leave the stops for.
export const ACTIONS = 'actions';
export const NAVBAR = 'navbar';

// Where a press leaves a stop for. The stops run in page order, the column beside the poster first
// and then the full width rows under it. Up off the top of the column goes to the toolbar when it
// runs along the top, and back to the buttons beside a sidebar, which Left already reaches. Down
// from the buttons skips the column, since that's reached by going right.
export const stageNeighbour = ({beside, below}, from, direction, navbarTop) => {
	if (from === ACTIONS) {
		if (direction === 'down') return below[0] || beside[0] || null;
		if (direction === 'right') return beside[0] || null;
		return null;
	}
	const b = beside.indexOf(from);
	const r = below.indexOf(from);
	if (direction === 'up') {
		if (b > 0) return beside[b - 1];
		if (b === 0) return navbarTop ? NAVBAR : ACTIONS;
		if (r > 0) return below[r - 1];
		if (r === 0) return beside.length ? beside[beside.length - 1] : ACTIONS;
		return null;
	}
	if (b >= 0) return beside[b + 1] || below[0] || null;
	if (r >= 0) return below[r + 1] || null;
	return null;
};

// How far to scroll so a section is wholly on screen, or 0 when it already is. A section taller than
// the view lines its top up with the view's.
export const revealDelta = ({top, bottom}, {viewTop, viewBottom}) => {
	if (top < viewTop) return top - viewTop;
	if (bottom > viewBottom) return Math.min(bottom - viewBottom, top - viewTop);
	return 0;
};

// How far to scroll so a focused card that's partly off screen sits three tenths of the way down the
// room the view has around it, as Core lines it up. A card wholly on screen stays put.
export const alignDelta = ({top, bottom}, {viewTop, viewBottom}) => (
	top < viewTop || bottom > viewBottom ? top - viewTop - (viewBottom - viewTop - (bottom - top)) * 0.3 : 0
);
