// The Live TV guide's rules, kept apart from the screen so they can be tested on their own:
// channel ordering, program facts, the cell timeline each row is drawn from, the selection that
// vertical movement holds onto, and the geometry of the guide and the channel carousel.
//
// Times are epoch milliseconds throughout.

const MINUTE = 60000;

// Every size below is written against the canvas the other clients lay a television out on,
// which a 1080p panel paints at 1.45 pixels to the point. The screen multiplies by this to land
// on the same painted size in this app's 1920 wide design space.
export const TV_CANVAS_SCALE = 1.45;

// How fast a long program description scrolls, 55 ms per canvas point.
export const DESCRIPTION_MS_PER_PIXEL = 55 / TV_CANVAS_SCALE;
// The quick channel changer's description scrolls half as fast.
export const CAROUSEL_DESCRIPTION_MS_PER_PIXEL = 110 / TV_CANVAS_SCALE;

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export const CHANNEL_SORTS = ['number', 'name', 'favoritesFirst'];

const nameOf = (channel) => (channel?.Name || '').toLowerCase();

const compareByName = (a, b) => {
	const left = nameOf(a);
	const right = nameOf(b);
	if (left < right) return -1;
	return left > right ? 1 : 0;
};

// Channel numbers are dot separated segments ('10.10' airs after '10.2'), so they compare
// segment by segment as whole numbers rather than as a decimal.
const numberSegments = (number) => {
	if (number == null || !String(number).trim()) return null;
	const segments = [];
	for (const part of String(number).trim().split('.')) {
		if (!/^[+-]?\d+$/.test(part)) return null;
		segments.push(parseInt(part, 10));
	}
	return segments;
};

const compareByNumber = (a, b) => {
	const segsA = numberSegments(a.ChannelNumber);
	const segsB = numberSegments(b.ChannelNumber);
	if (!segsA || !segsB) {
		if (segsA) return -1;
		if (segsB) return 1;
		return compareByName(a, b);
	}
	const len = Math.max(segsA.length, segsB.length);
	for (let i = 0; i < len; i++) {
		const va = i < segsA.length ? segsA[i] : 0;
		const vb = i < segsB.length ? segsB[i] : 0;
		if (va !== vb) return va - vb;
	}
	return compareByName(a, b);
};

const isFavoriteChannel = (channel) => channel?.UserData?.IsFavorite === true;

// Shared by the guide and the channel carousel, so zapping order always matches the guide.
export const channelComparator = (sortBy) => {
	if (sortBy === 'name') return compareByName;
	if (sortBy === 'favoritesFirst') {
		return (a, b) => {
			const favA = isFavoriteChannel(a);
			const favB = isFavoriteChannel(b);
			if (favA !== favB) return favA ? -1 : 1;
			return compareByNumber(a, b);
		};
	}
	return compareByNumber;
};

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export const programStart = (program) => new Date(program.StartDate).getTime();
export const programEnd = (program) => new Date(program.EndDate).getTime();

// Some guide sources send the episode title with its quotes still backslash escaped, even where
// the same program's overview doesn't, so this field alone is unescaped.
export const episodeTitleOf = (program) => (program?.EpisodeTitle || '').replace(/\\"/g, '"');

export const seasonEpisodeLabel = (program) => {
	const season = program?.ParentIndexNumber;
	const episode = program?.IndexNumber;
	return season != null && episode != null ? `S${season}:E${episode}` : null;
};

// The episode title and its (S1:E5) numbering, each on its own when the listing carries only one
// of them. A title that only repeats the program name is left out. Empty when there's nothing to show.
export const episodeLine = (program) => {
	const title = episodeTitleOf(program).trim();
	const label = seasonEpisodeLabel(program);
	return [title !== (program?.Name || '').trim() && title, label ? `(${label})` : ''].filter(Boolean).join(' ');
};

export const hasTimer = (program) => program?.TimerId != null;
export const hasSeriesTimer = (program) => program?.SeriesTimerId != null;

// 'record' for a one off, 'series' when a series rule will record this showing and 'skipped' when
// the rule passes it over. A string rather than an object, so a memoized cell can compare it.
export const recordingMark = (program) => {
	if (hasSeriesTimer(program)) return hasTimer(program) ? 'series' : 'skipped';
	return hasTimer(program) ? 'record' : null;
};

// The choices a series recording can make, as the two flags the server's series rule reads.
export const SERIES_EPISODE_CHOICES = [
	{key: 'all', label: 'All Episodes', detail: 'Every showing, including repeats', flags: {RecordNewOnly: false, SkipEpisodesInLibrary: false}},
	{key: 'notRecorded', label: 'Episodes Not Already Recorded', detail: 'Skips episodes already in your library and records each episode once', flags: {RecordNewOnly: false, SkipEpisodesInLibrary: true}},
	{key: 'newOnly', label: 'New Episodes Only', detail: 'First airings only, no repeats', flags: {RecordNewOnly: true, SkipEpisodesInLibrary: true}}
];

export const DEFAULT_SERIES_CHOICE = 'notRecorded';

export const seriesChoiceOf = (rule) => {
	if (rule?.RecordNewOnly) return 'newOnly';
	return rule?.SkipEpisodesInLibrary ? 'notRecorded' : 'all';
};

export const seriesChoiceFlags = (key) => SERIES_EPISODE_CHOICES.find((choice) => choice.key === key).flags;

export const isLiveAt = (program, now) => now > programStart(program) && now < programEnd(program);

// The program on air at a moment, counting its first instant. Used to pick what a channel is
// showing, where the live flag above leaves that instant out.
export const isAiringAt = (program, now) => now >= programStart(program) && now < programEnd(program);

export const programAiringAt = (programs, now) => (programs || []).find((program) => isAiringAt(program, now)) || null;

export const progressAt = (program, now) => {
	const start = programStart(program);
	const end = programEnd(program);
	if (now < start) return 0;
	if (now > end) return 1;
	return (now - start) / (end - start);
};

// Where a program's artwork lives: its own art, then the matched series' poster, then the
// parent's poster, and last the parent's landscape thumb. Only the last one names a Thumb image,
// which the server serves from a different endpoint than a Primary.
export const artworkSource = (program) => {
	const own = program?.ImageTags?.Primary;
	if (own) return {itemId: program.Id, tag: own, isThumb: false};
	if (program?.SeriesId && program.SeriesPrimaryImageTag) {
		return {itemId: program.SeriesId, tag: program.SeriesPrimaryImageTag, isThumb: false};
	}
	if (program?.ParentPrimaryImageItemId && program.ParentPrimaryImageTag) {
		return {itemId: program.ParentPrimaryImageItemId, tag: program.ParentPrimaryImageTag, isThumb: false};
	}
	if (program?.ParentThumbItemId && program.ParentThumbImageTag) {
		return {itemId: program.ParentThumbItemId, tag: program.ParentThumbImageTag, isThumb: true};
	}
	return null;
};

// ---------------------------------------------------------------------------
// Genres and filters
// ---------------------------------------------------------------------------

const GENRES = [
	{flag: 'IsMovie', label: 'Movie', color: '#6c4bd8', rgb: '108, 75, 216'},
	{flag: 'IsSports', label: 'Sports', color: '#2e8b57', rgb: '46, 139, 87'},
	{flag: 'IsNews', label: 'News', color: '#c08a2e', rgb: '192, 138, 46'},
	{flag: 'IsKids', label: 'Kids', color: '#c0497a', rgb: '192, 73, 122'},
	{flag: 'IsSeries', label: 'Series', color: '#2e7d8a', rgb: '46, 125, 138'}
];

// A program with no genre takes the accent, which the screen supplies.
export const genreFor = (program) => GENRES.find((genre) => program?.[genre.flag] === true) || null;

// The guide's filter chips, in the order they show. The label is also what a program's category
// tags read as, so the two are named once.
export const GUIDE_FILTERS = [
	{key: 'all', label: 'All'},
	{key: 'movies', label: 'Movies', flag: 'IsMovie'},
	{key: 'series', label: 'Series', flag: 'IsSeries'},
	{key: 'sports', label: 'Sports', flag: 'IsSports'},
	{key: 'news', label: 'News', flag: 'IsNews'},
	{key: 'kids', label: 'Kids', flag: 'IsKids'},
	{key: 'premiere', label: 'Premiere', flag: 'IsPremiere'},
	{key: 'favorites', label: 'Favorites'}
];

const filterByKey = (key) => GUIDE_FILTERS.find((filter) => filter.key === key) || GUIDE_FILTERS[0];

export const isCategoryFilter = (key) => key !== 'all' && key !== 'favorites';

// The categories the server can filter on itself. Premiere isn't one, so it walks the lineup in
// ordinary batches and is matched here.
export const SERVER_FILTERED_CATEGORIES = ['movies', 'series', 'sports', 'news', 'kids'];

export const matchesFilter = (key, program) => {
	const flag = filterByKey(key).flag;
	return flag ? program?.[flag] === true : true;
};

// The program's categories in a fixed order, as filter keys.
export const categoryTags = (program) => GUIDE_FILTERS
	.filter((filter) => filter.flag && filter.key !== 'all' && program?.[filter.flag] === true)
	.map((filter) => filter.key);

export const filterLabel = (key) => filterByKey(key).label;

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

export const floorToHalfHour = (time) => {
	const d = new Date(time);
	d.setMinutes(d.getMinutes() - (d.getMinutes() % 30), 0, 0);
	return d.getTime();
};

// The guide's left edge, the nearest top or bottom of the hour at or before now. Looking further
// back is the earlier button's job.
export const guideLeftEdge = (now) => floorToHalfHour(now);

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

// program: a real airing. gap: a hole in the schedule. filtered: a hole a genre filter made.
// loading: the whole row while its programs are on their way.
export const CELL_KINDS = {program: 'program', gap: 'gap', filtered: 'filtered', loading: 'loading'};

// Partitions a hole at hidden program boundaries, so a real gap isn't swallowed by a filtered
// program that covers only part of it.
const fillHole = (start, end, unfiltered) => {
	const hidden = unfiltered
		.map((program) => ({
			start: Math.max(programStart(program), start),
			end: Math.min(programEnd(program), end)
		}))
		.filter((interval) => interval.start < interval.end)
		.sort((a, b) => a.start - b.start);

	const cells = [];
	let cursor = start;
	for (const interval of hidden) {
		const filteredStart = Math.max(interval.start, cursor);
		if (filteredStart > cursor) cells.push({start: cursor, end: filteredStart, kind: CELL_KINDS.gap});
		if (filteredStart < interval.end) {
			cells.push({start: filteredStart, end: interval.end, kind: CELL_KINDS.filtered});
			cursor = interval.end;
		}
	}
	if (cursor < end) cells.push({start: cursor, end, kind: CELL_KINDS.gap});
	return cells;
};

// The continuous, non overlapping cells for one row across the window, so a vertical move always
// resolves a clock time to a cell.
export const buildRowCells = ({visible, unfiltered, windowStart, windowEnd, loaded}) => {
	if (!loaded) return [{start: windowStart, end: windowEnd, kind: CELL_KINDS.loading}];

	// Clipped and sorted here, since the server can answer out of order and clipping can leave a
	// program that only touches the edge with no width at all.
	const clipped = (visible || [])
		.map((program) => ({
			start: Math.max(programStart(program), windowStart),
			end: Math.min(programEnd(program), windowEnd),
			program
		}))
		.filter((cell) => cell.start < cell.end)
		.sort((a, b) => a.start - b.start);

	const cells = [];
	let cursor = windowStart;
	for (const cell of clipped) {
		// Overlapping programs can start behind the cursor. The covered part is skipped rather
		// than drawn twice.
		const start = Math.max(cell.start, cursor);
		if (start >= cell.end) continue;
		if (start > cursor) cells.push(...fillHole(cursor, start, unfiltered || []));
		cells.push({start, end: cell.end, kind: CELL_KINDS.program, program: cell.program});
		cursor = cell.end;
	}
	if (cursor < windowEnd) cells.push(...fillHole(cursor, windowEnd, unfiltered || []));
	return cells;
};

// Index of the cell covering the anchor. Cells tile the window, so one always matches.
export const resolveCellIndexAt = (cells, anchor) => {
	for (let i = 0; i < cells.length; i++) {
		if (cells[i].start <= anchor && cells[i].end > anchor) return i;
	}
	return anchor < cells[0].start ? 0 : cells.length - 1;
};

// Pulls the anchor inside the cell's half open interval.
export const clampAnchorInto = (cell, anchor) => {
	if (anchor < cell.start) return cell.start;
	if (anchor >= cell.end) return cell.end - 1;
	return anchor;
};

// Re-resolves the selection against a window that just moved. The selected cell stays when it
// still intersects the window, with the anchor clamped into it. Otherwise the airing cell is
// taken and the anchor reset to now. The channel never changes.
export const reanchorSelection = ({current, cells, now}) => {
	if (!cells.length) return current;

	let retained = null;
	if (current.programId) {
		retained = cells.find((cell) => cell.program?.Id === current.programId) || null;
	} else if (current.anchorTime >= cells[0].start && current.anchorTime < cells[cells.length - 1].end) {
		retained = cells[resolveCellIndexAt(cells, current.anchorTime)];
	}
	if (retained) return {...current, anchorTime: clampAnchorInto(retained, current.anchorTime)};

	const airing = cells[resolveCellIndexAt(cells, now)];
	return {...current, anchorTime: now, programId: airing.program?.Id || null};
};

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const MIN_GUIDE_WINDOW_MINUTES = 150;
const MAX_GUIDE_WINDOW_MINUTES = 360;
const SLOT_MINUTES = 30;
// Wide enough for a half hour cell to read its title at ten feet.
const TARGET_POINTS_PER_MINUTE = 6.2;

// How long a window the guide shows for the width it has in canvas points, as many half hours as
// fit at a readable density once the channel column takes its share.
export const guideWindowFor = (availableWidth) => {
	const width = Math.max(1, availableWidth);
	const guideWidth = Math.max(1, width - clamp(width * 0.16, 144, 208));
	const slots = clamp(
		Math.round(guideWidth / (TARGET_POINTS_PER_MINUTE * SLOT_MINUTES)),
		MIN_GUIDE_WINDOW_MINUTES / SLOT_MINUTES,
		MAX_GUIDE_WINDOW_MINUTES / SLOT_MINUTES
	);
	return slots * SLOT_MINUTES * MINUTE;
};

// The smallest window, which the carousel's own data uses.
export const DEFAULT_GUIDE_WINDOW_MS = MIN_GUIDE_WINDOW_MINUTES * MINUTE;

// ---------------------------------------------------------------------------
// Channel carousel
// ---------------------------------------------------------------------------

const CAROUSEL_CARD_WIDTH = 320;
export const CAROUSEL_CARD_HEIGHT = 151;
const CAROUSEL_CARD_SPACING = 10;
const CAROUSEL_MIN_CARD_WIDTH = 207;
const CAROUSEL_MAX_CARD_WIDTH = 386;
const CAROUSEL_MIN_LEGIBLE_WIDTH = 166;
const CAROUSEL_MAX_CARD_COUNT = 15;

// Maps any step count onto a real channel index, wrapping both ways.
export const channelIndexFor = (rawIndex, channelCount) => ((rawIndex % channelCount) + channelCount) % channelCount;

// Strip geometry for an available width in canvas points: the pitch, the card width and how
// many pitches fit across.
export const carouselLayoutFor = (stripWidth) => {
	if (!isFinite(stripWidth) || stripWidth <= 0) {
		return {pitch: CAROUSEL_CARD_WIDTH + CAROUSEL_CARD_SPACING, width: CAROUSEL_CARD_WIDTH, count: 1};
	}
	const pitchFor = (cards) => Math.floor(stripWidth / cards * 2) / 2;
	const widthFor = (cards) => pitchFor(cards) - CAROUSEL_CARD_SPACING;
	let best = 0;
	let bestDistance = Infinity;
	let widest = 0;
	for (let cards = 1; cards <= CAROUSEL_MAX_CARD_COUNT; cards++) {
		const candidate = widthFor(cards);
		if (candidate < CAROUSEL_MIN_LEGIBLE_WIDTH) break;
		widest = cards;
		if (candidate < CAROUSEL_MIN_CARD_WIDTH || candidate > CAROUSEL_MAX_CARD_WIDTH) continue;
		const distance = Math.abs(candidate - CAROUSEL_CARD_WIDTH);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = cards;
		}
	}
	const count = best !== 0 ? best : Math.max(1, widest);
	return {pitch: pitchFor(count), width: widthFor(count), count};
};

// The run of channels around the centered one the strip can show, wrapping at both ends, so a
// warm fetch asks for exactly what an open strip would.
export const carouselNeighborhood = (channels, centeredId, visibleCards) => {
	if (!channels.length) return [];
	const center = Math.max(0, channels.findIndex((channel) => channel.Id === centeredId));
	const radius = Math.ceil(visibleCards / 2) + 1;
	const ids = [];
	for (let offset = -radius; offset <= radius; offset++) {
		const id = channels[channelIndexFor(center + offset, channels.length)].Id;
		if (ids.indexOf(id) < 0) ids.push(id);
	}
	return ids;
};
