// The Live TV guide's data: the lineup, the programs fetched for it, the window they cover, the
// active filter and sort, and the refreshes that keep it current as programs start and end.
//
// One store backs one surface. The guide screen owns one, and the player owns another for its
// channel carousel. Listeners are told whenever anything they draw from changes.

import {
	DEFAULT_GUIDE_WINDOW_MS, SERVER_FILTERED_CATEGORIES, artworkSource, channelComparator,
	isCategoryFilter, matchesFilter, programEnd, programStart
} from '../utils/liveTvGuide';

const MINUTE = 60000;

// Programs load lazily, this many channels at a time, instead of one request for the whole lineup.
const PROGRAM_BATCH = 50;

// Category filters walk the lineup in larger server filtered batches, so a sparse genre can
// surface channels well past the first page of the plain guide.
const CATEGORY_BATCH = 200;
const CATEGORY_MIN_ROWS_PER_PAGE = 24;

// Delay before retrying when the server returned nothing past the coverage already held.
const NO_NEW_COVERAGE_RETRY = 5 * MINUTE;
const FAILURE_BACKOFF = MINUTE;
// Keeps the current program in hand when a rolling refresh starts late.
const ROLLING_REFRESH_LOOKBACK = 15 * MINUTE;
const ROLLING_REFRESH_HORIZON = DEFAULT_GUIDE_WINDOW_MS;

const ARTWORK_CACHE_CAP = 2000;
const ARTWORK_PREFETCH_CONCURRENCY = 3;
const ARTWORK_PREFETCH_HORIZON = 6 * 60 * MINUTE;
// After this many lookups in a row fail, the server is taken not to answer them at all.
const ARTWORK_FAILURE_LIMIT = 8;

// Inserting past the cap drops the oldest entry rather than the whole cache.
const insertWithCap = (cache, key, value) => {
	cache.delete(key);
	if (cache.size >= ARTWORK_CACHE_CAP) cache.delete(cache.keys().next().value);
	cache.set(key, value);
};

// A repeat airing of an episode already resolved is a cache hit. Without an episode title the
// name alone would be the key, and generic names recur across unrelated channels.
const contentKeyFor = (program) => {
	const episode = (program.EpisodeTitle || '').trim();
	return episode ? `${program.Name}\u0000${episode}` : `${program.Name}\u0000CH\u0000${program.ChannelId}`;
};

export const createLiveTvGuideStore = (api, {sortBy = 'number', now = () => Date.now()} = {}) => {
	const listeners = new Set();
	// Only the hero shows artwork, so a lookup landing wakes it rather than the whole grid.
	const artworkListeners = new Set();
	let disposed = false;

	let state = 'loading';
	let error = null;
	let channels = [];
	let sort = sortBy;
	let filter = 'all';

	let guideWindow = DEFAULT_GUIDE_WINDOW_MS;
	let guideDate = now();
	let windowStart = now();
	let windowEnd = now();
	let atLivePosition = true;

	const programsByChannel = new Map();
	const programsLoadedIds = new Set();
	let programsHighWater = 0;
	// Program boundaries already handled, so one is never picked twice.
	const processedBoundaries = new Set();
	let loadingMore = false;

	const categoryPrograms = new Map();
	const categoryQueriedIds = new Set();
	let categoryHighWater = 0;
	let categoryLoadedFor = null;
	let categoryRequest = 0;
	let categoryFetchInFlight = false;

	// Bumped by every replacement and every cache reset, so a reply whose window or channel set
	// has since moved on is dropped.
	let programGeneration = 0;
	let loadGeneration = 0;

	const notify = () => {
		if (!disposed) listeners.forEach((listener) => listener());
	};

	const channelForId = (id) => channels.find((channel) => channel.Id === id) || null;

	const hasProgramsFor = (id) => (isCategoryFilter(filter) ? categoryPrograms.has(id) : programsLoadedIds.has(id));

	const programsForChannel = (id) => {
		if (isCategoryFilter(filter)) return categoryPrograms.get(id) || [];
		const all = programsByChannel.get(id) || [];
		return filter === 'all' || filter === 'favorites' ? all : all.filter((p) => matchesFilter(filter, p));
	};

	const filteredChannels = () => {
		if (filter === 'all') return channels;
		if (filter === 'favorites') return channels.filter((channel) => channel.UserData?.IsFavorite === true);
		if (categoryLoadedFor !== filter) return [];
		return channels.filter((channel) => categoryPrograms.has(channel.Id));
	};

	// ------------------------------------------------------------------------------------------
	// Fetching
	// ------------------------------------------------------------------------------------------

	const fetchGuide = ({ids, from, to, category}) => api.getLiveTvPrograms(ids, new Date(from), new Date(to), {category});

	// Programs keyed by channel id, each list in start order.
	const parsePrograms = (response) => {
		const byChannel = new Map();
		for (const raw of response?.Items || []) {
			if (!raw?.ChannelId || !raw.StartDate || !raw.EndDate) continue;
			if (!byChannel.has(raw.ChannelId)) byChannel.set(raw.ChannelId, []);
			byChannel.get(raw.ChannelId).push(raw);
		}
		byChannel.forEach((programs) => programs.sort((a, b) => programStart(a) - programStart(b)));
		return byChannel;
	};

	// Only the channels with a matching program come back.
	const fetchCategoryPrograms = async (batch, category) => {
		if (!batch.length) return new Map();
		const response = await fetchGuide({ids: batch.map((c) => c.Id), from: windowStart, to: windowEnd, category});
		const byChannel = parsePrograms(response);
		byChannel.forEach((programs, id) => {
			const kept = programs.filter((p) => matchesFilter(category, p));
			if (kept.length) byChannel.set(id, kept);
			else byChannel.delete(id);
		});
		return byChannel;
	};

	// Fresh programs for channels already in hand, or null once a newer fetch or a dispose has
	// made them stale.
	const fetchProgramReplacements = async (ids, from, to, generation) => {
		const replacements = new Map();
		for (let i = 0; i < ids.length; i += PROGRAM_BATCH) {
			const chunk = ids.slice(i, i + PROGRAM_BATCH);
			const response = await fetchGuide({ids: chunk, from, to});
			if (disposed || generation !== programGeneration) return null;
			const parsed = parsePrograms(response);
			chunk.forEach((id) => replacements.set(id, parsed.get(id) || []));
		}
		return replacements;
	};

	// Every requested channel counts as loaded, even one with no programs, so its row stops
	// showing the placeholder.
	const loadProgramsBatch = async (batch) => {
		if (!batch.length) return true;
		const generation = programGeneration;
		const ids = batch.map((c) => c.Id);
		const response = await fetchGuide({ids, from: windowStart, to: windowEnd});
		if (disposed || generation !== programGeneration) return false;
		const parsed = parsePrograms(response);
		for (const id of ids) {
			const programs = parsed.get(id) || [];
			const existing = programsByChannel.get(id);
			if (!existing) {
				programsByChannel.set(id, programs);
			} else {
				existing.push(...programs);
				existing.sort((a, b) => programStart(a) - programStart(b));
			}
			programsLoadedIds.add(id);
		}
		return true;
	};

	const loadNextBatch = async () => {
		if (programsHighWater >= channels.length) return;
		const end = Math.min(programsHighWater + PROGRAM_BATCH, channels.length);
		// A re-sort can move fetched channels back into the unwalked stretch, and fetching them
		// again would append their programs twice.
		const batch = channels.slice(programsHighWater, end).filter((c) => !programsLoadedIds.has(c.Id));
		if (await loadProgramsBatch(batch)) programsHighWater = end;
	};

	const resetCategory = () => {
		categoryPrograms.clear();
		categoryQueriedIds.clear();
		categoryHighWater = 0;
		categoryLoadedFor = null;
		categoryRequest++;
	};

	const resetPrograms = () => {
		programGeneration++;
		programsByChannel.clear();
		programsLoadedIds.clear();
		programsHighWater = 0;
		processedBoundaries.clear();
		resetCategory();
	};

	// Walks the lineup until a page's worth of matching rows has turned up, or until the high
	// water mark a reload has to get back to.
	const walkCategory = async (minHighWater = 0) => {
		const request = categoryRequest;
		const active = filter;
		categoryLoadedFor = active;
		const startRows = categoryPrograms.size;
		while (categoryHighWater < channels.length &&
			(categoryPrograms.size - startRows < CATEGORY_MIN_ROWS_PER_PAGE || categoryHighWater < minHighWater)) {
			const size = SERVER_FILTERED_CATEGORIES.indexOf(active) >= 0 ? CATEGORY_BATCH : PROGRAM_BATCH;
			const end = Math.min(categoryHighWater + size, channels.length);
			const batch = channels.slice(categoryHighWater, end).filter((c) => !categoryQueriedIds.has(c.Id));
			const fetched = await fetchCategoryPrograms(batch, active);
			if (request !== categoryRequest) return;
			batch.forEach((c) => categoryQueriedIds.add(c.Id));
			categoryHighWater = end;
			if (!fetched.size) continue;
			fetched.forEach((programs, id) => categoryPrograms.set(id, programs));
			notify();
		}
	};

	const loadCategoryPrograms = async () => {
		resetCategory();
		const request = categoryRequest;
		categoryFetchInFlight = true;
		state = 'loading';
		notify();
		try {
			await walkCategory();
			if (request !== categoryRequest) return;
			state = 'ready';
		} catch (err) {
			if (request !== categoryRequest) return;
			error = err;
			state = 'error';
		}
		categoryFetchInFlight = false;
		notify();
	};

	const fetchChannels = async (generation) => {
		const response = await api.getLiveTvChannels();
		if (disposed || generation !== loadGeneration) return false;
		channels = [...(response?.Items || [])].sort(channelComparator(sort));
		return true;
	};

	const hasMorePrograms = () => (isCategoryFilter(filter)
		? categoryHighWater < channels.length
		: programsHighWater < channels.length);

	// Fetches only the channels asked for that aren't in hand yet, even when they sit past the
	// scroll high water mark.
	const ensureProgramsForChannels = async (ids) => {
		const missing = ids.filter((id) => !programsLoadedIds.has(id));
		if (!missing.length) return;
		for (let i = 0; i < missing.length; i += PROGRAM_BATCH) {
			const chunk = missing.slice(i, i + PROGRAM_BATCH).map(channelForId).filter(Boolean);
			if (!(await loadProgramsBatch(chunk))) return;
		}
		notify();
	};

	const loadInitialPrograms = async () => {
		resetPrograms();
		await loadNextBatch();
	};

	const load = async ({window: nextWindow, initialChannelIds, windowStart: start, livePosition = true} = {}) => {
		const generation = ++loadGeneration;
		if (nextWindow) guideWindow = nextWindow;
		state = 'loading';
		notify();
		try {
			if (!(await fetchChannels(generation))) return;
			const d = new Date(guideDate);
			d.setHours(new Date(now()).getHours(), 0, 0, 0);
			windowStart = start != null ? start : d.getTime();
			windowEnd = windowStart + guideWindow;
			atLivePosition = livePosition;
			if (initialChannelIds) {
				// A targeted open, the carousel's, fetches only its neighborhood.
				resetPrograms();
				await ensureProgramsForChannels(initialChannelIds);
			} else {
				await loadInitialPrograms();
			}
			if (isCategoryFilter(filter)) await walkCategory();
			if (disposed || generation !== loadGeneration) return;
			state = 'ready';
		} catch (err) {
			if (disposed || generation !== loadGeneration) return;
			error = err;
			state = 'error';
		}
		notify();
	};

	// Re-fetches as many channels as were already loaded, so the viewer keeps the rows they had
	// scrolled to.
	const reloadPrograms = async () => {
		const generation = ++loadGeneration;
		state = 'loading';
		notify();
		try {
			const target = Math.max(programsHighWater, PROGRAM_BATCH);
			const categoryTarget = categoryHighWater;
			resetPrograms();
			if (isCategoryFilter(filter)) {
				await walkCategory(categoryTarget);
			} else {
				while (programsHighWater < target && hasMorePrograms()) {
					await loadNextBatch();
					if (disposed || generation !== loadGeneration) return;
				}
			}
			if (disposed || generation !== loadGeneration) return;
			state = 'ready';
		} catch (err) {
			if (disposed || generation !== loadGeneration) return;
			error = err;
			state = 'error';
		}
		notify();
	};

	const loadMorePrograms = async () => {
		if (loadingMore || !hasMorePrograms()) return;
		const generation = programGeneration;
		loadingMore = true;
		try {
			if (isCategoryFilter(filter)) await walkCategory();
			else await loadNextBatch();
		} finally {
			loadingMore = false;
			// A reload owns the first batch until the guide is ready.
			if (!disposed && state === 'ready' && generation !== programGeneration && hasMorePrograms()) {
				loadMorePrograms();
			}
		}
		notify();
	};

	// ------------------------------------------------------------------------------------------
	// Sort, filter and window
	// ------------------------------------------------------------------------------------------

	const setSortBy = (value) => {
		if (sort === value) return;
		programGeneration++;
		sort = value;
		channels = [...channels].sort(channelComparator(value));
		// The lazy load follows list order, so it walks again from the top. Channels already in hand
		// are skipped.
		programsHighWater = 0;
		categoryHighWater = 0;
		categoryRequest++;
		notify();
		loadMorePrograms();
	};

	const setFilter = (value) => {
		if (filter === value) return;
		filter = value;
		categoryRequest++;
		if (categoryFetchInFlight) {
			categoryFetchInFlight = false;
			state = 'ready';
		}
		if (isCategoryFilter(value) && categoryLoadedFor !== value) {
			loadCategoryPrograms();
			return;
		}
		notify();
		// Favorites can sit anywhere in the lineup, past what has loaded so far.
		if (value === 'favorites') {
			ensureProgramsForChannels(channels.filter((c) => c.UserData?.IsFavorite === true).map((c) => c.Id));
		}
	};

	const setDate = async (date) => {
		guideDate = date;
		const d = new Date(date);
		d.setHours(new Date(windowStart).getHours(), 0, 0, 0);
		windowStart = d.getTime();
		windowEnd = windowStart + guideWindow;
		atLivePosition = false;
		await reloadPrograms();
	};

	// Moves the window without entering the loading state. The rows on screen stay until every
	// replacement is in.
	const setWindowStart = async (start, {livePosition = false} = {}) => {
		if (disposed) return;
		if (start === windowStart) {
			atLivePosition = livePosition;
			return;
		}
		const ids = Array.from(programsLoadedIds);
		const generation = ++programGeneration;
		windowStart = start;
		windowEnd = start + guideWindow;
		guideDate = start;
		atLivePosition = livePosition;
		notify();
		if (!ids.length) return;

		const replacements = await fetchProgramReplacements(ids, windowStart, windowEnd, generation);
		if (!replacements) return;
		replacements.forEach((programs, id) => programsByChannel.set(id, programs));
		processedBoundaries.clear();
		notify();
	};

	const goToNow = async ({windowStart: start} = {}) => {
		guideDate = now();
		await load({window: guideWindow, windowStart: start, livePosition: true});
	};

	// ------------------------------------------------------------------------------------------
	// Favorites and recordings
	// ------------------------------------------------------------------------------------------

	const applyChannelUpdate = (updated) => {
		const at = channels.findIndex((c) => c.Id === updated.Id);
		if (at < 0) return;
		const next = [...channels];
		next[at] = updated;
		// Only favorites first reads the flag, so under any other sort the lineup stays put.
		const resort = sort === 'favoritesFirst';
		if (resort) {
			next.sort(channelComparator(sort));
			programsHighWater = 0;
		}
		channels = next;
		notify();
		if (resort) loadMorePrograms();
	};

	const toggleChannelFavorite = async (channelId) => {
		const current = channelForId(channelId);
		if (!current) return;
		const next = current.UserData?.IsFavorite !== true;
		applyChannelUpdate({...current, UserData: {...(current.UserData || {}), IsFavorite: next}});
		try {
			await api.setFavorite(channelId, next);
		} catch (err) {
			applyChannelUpdate(current);
			throw err;
		}
	};

	const toggleProgramRecording = async (program) => {
		if (program.TimerId != null) {
			if (!program.TimerId) throw new Error(`TimerId missing for scheduled program ${program.Id}`);
			await api.cancelLiveTvTimer(program.TimerId);
		} else {
			await api.createLiveTvTimer(program.Id);
		}
		await reloadPrograms();
	};

	const toggleSeriesRecording = async (program) => {
		if (program.SeriesTimerId != null) {
			if (!program.SeriesTimerId) throw new Error(`SeriesTimerId missing for scheduled series ${program.Id}`);
			await api.cancelLiveTvSeriesTimer(program.SeriesTimerId);
		} else {
			await api.createLiveTvSeriesTimer(program.Id);
		}
		await reloadPrograms();
	};

	// ------------------------------------------------------------------------------------------
	// Refreshing as programs start and end
	// ------------------------------------------------------------------------------------------

	let boundaryTimer = null;
	let boundaryDueAt = null;
	let carouselRefreshInFlight = null;
	let boundaryRefreshInFlight = false;
	let boundarySchedulingEnabled = false;

	const boundaries = () => {
		const all = [];
		programsByChannel.forEach((programs) => {
			programs.forEach((p) => all.push(programStart(p), programEnd(p)));
		});
		return all;
	};

	const nextBoundary = (at) => {
		let next = null;
		for (const boundary of boundaries()) {
			if (boundary <= at || processedBoundaries.has(boundary)) continue;
			if (next === null || boundary < next) next = boundary;
		}
		return next;
	};

	const coverageEnd = () => {
		let end = null;
		for (const boundary of boundaries()) {
			if (end === null || boundary > end) end = boundary;
		}
		return end;
	};

	// True when a channel with programs has run out of them, the one case the cached schedule
	// can't cover by itself.
	const coverageLapsed = (at) => {
		let lapsed = false;
		programsByChannel.forEach((programs) => {
			if (!programs.length || lapsed) return;
			const end = Math.max(...programs.map(programEnd));
			if (end <= at) lapsed = true;
		});
		return lapsed;
	};

	// Covers the guide's window as well as a rolling horizon, so no surface's coverage shrinks.
	const refreshLoadedChannels = async (at) => {
		const ids = Array.from(programsLoadedIds);
		if (!ids.length) return;
		const from = Math.min(windowStart, at);
		const to = Math.max(at + guideWindow, windowEnd);
		const replacements = await fetchProgramReplacements(ids, from, to, ++programGeneration);
		if (!replacements) return;
		replacements.forEach((programs, id) => programsByChannel.set(id, programs));
		notify();
	};

	let handleBoundaryElapsed = null;

	const arm = (delay, dueAt) => {
		if (disposed) return;
		boundaryDueAt = dueAt;
		boundaryTimer = setTimeout(() => handleBoundaryElapsed(), delay);
	};

	const armRetry = (delay) => arm(delay, now() + delay);

	// Arms a one shot refresh on the next unhandled program boundary.
	const scheduleBoundaryRefresh = () => {
		if (disposed) return;
		boundarySchedulingEnabled = true;
		clearTimeout(boundaryTimer);
		boundaryTimer = null;
		const at = now();
		processedBoundaries.forEach((b) => {
			if (b < at - 60 * MINUTE) processedBoundaries.delete(b);
		});

		// The armed boundary passed without firing, so it runs once now rather than in the past.
		if (boundaryDueAt !== null && boundaryDueAt <= at) {
			boundaryDueAt = null;
			handleBoundaryElapsed();
			return;
		}
		boundaryDueAt = null;

		const next = nextBoundary(at);
		if (next === null) {
			// A schedule with no future boundary is already stale. An empty one has nothing to
			// refresh and falls back to the surface's quarter hour tick.
			if (boundaries().length) handleBoundaryElapsed();
			return;
		}
		arm(next - at, next);
	};

	const rearmBoundaryIfEnabled = () => {
		if (boundarySchedulingEnabled && !disposed) scheduleBoundaryRefresh();
	};

	const scheduleAfterRollingRefresh = () => {
		if (!boundarySchedulingEnabled) return;
		if (nextBoundary(now()) !== null || !boundaries().length) scheduleBoundaryRefresh();
		else armRetry(NO_NEW_COVERAGE_RETRY);
	};

	// Promotes from the cache where the schedule already covers the new time, and asks the
	// server only where coverage has to be extended.
	handleBoundaryElapsed = async ({forceRefresh = false} = {}) => {
		if (disposed || boundaryRefreshInFlight) return;
		boundaryRefreshInFlight = true;
		clearTimeout(boundaryTimer);
		boundaryTimer = null;
		boundaryDueAt = null;

		const at = now();
		boundaries().forEach((b) => {
			if (b <= at) processedBoundaries.add(b);
		});

		if (!forceRefresh && !coverageLapsed(at)) {
			// The next program is already cached, so the cells promote where they are.
			boundaryRefreshInFlight = false;
			notify();
			scheduleBoundaryRefresh();
			return;
		}

		const before = coverageEnd();
		try {
			await refreshLoadedChannels(at);
			if (disposed) {
				boundaryRefreshInFlight = false;
				return;
			}
		} catch {
			// A failed refresh keeps what the guide already holds.
			boundaryRefreshInFlight = false;
			armRetry(FAILURE_BACKOFF);
			return;
		}

		const after = coverageEnd();
		boundaryRefreshInFlight = false;
		if (after === null || (before !== null && after <= before)) {
			armRetry(NO_NEW_COVERAGE_RETRY);
			return;
		}
		scheduleBoundaryRefresh();
	};

	// The quarter hour fallback for a schedule that's empty or used up. A boundary or retry that's
	// already armed stays in charge.
	const refreshAtQuarterHour = async () => {
		if (disposed || boundaryDueAt !== null || boundaryRefreshInFlight) return;
		await handleBoundaryElapsed({forceRefresh: true});
	};

	const doRefreshCarouselPrograms = async () => {
		const at = now();
		const ids = Array.from(programsLoadedIds);
		if (!ids.length) {
			scheduleBoundaryRefresh();
			return;
		}
		const generation = ++programGeneration;
		let replacements;
		try {
			replacements = await fetchProgramReplacements(ids, at - ROLLING_REFRESH_LOOKBACK, at + ROLLING_REFRESH_HORIZON, generation);
			if (!replacements) {
				rearmBoundaryIfEnabled();
				return;
			}
		} catch {
			if (boundarySchedulingEnabled) armRetry(FAILURE_BACKOFF);
			return;
		}
		if (disposed || generation !== programGeneration) {
			rearmBoundaryIfEnabled();
			return;
		}
		replacements.forEach((programs, id) => programsByChannel.set(id, programs));
		processedBoundaries.forEach((b) => {
			if (b <= at) processedBoundaries.delete(b);
		});
		notify();
		scheduleAfterRollingRefresh();
	};

	// Replaces the carousel's channels around the current time in one go. Calls made while one is
	// running share it.
	const refreshCarouselPrograms = () => {
		if (disposed) return Promise.resolve();
		boundarySchedulingEnabled = true;
		if (carouselRefreshInFlight) return carouselRefreshInFlight;
		const tracked = doRefreshCarouselPrograms().then(() => {
			if (carouselRefreshInFlight === tracked) carouselRefreshInFlight = null;
		}, () => {
			if (carouselRefreshInFlight === tracked) carouselRefreshInFlight = null;
		});
		carouselRefreshInFlight = tracked;
		return tracked;
	};

	const cancelBoundaryRefresh = () => {
		boundarySchedulingEnabled = false;
		clearTimeout(boundaryTimer);
		boundaryTimer = null;
		boundaryDueAt = null;
	};

	// ------------------------------------------------------------------------------------------
	// Program artwork
	// ------------------------------------------------------------------------------------------

	// The bulk guide fetch runs with images off to keep its payload small, so a program's own art
	// never comes back from it. This asks for one program with images on. A result of null means
	// there is none, and is cached like any other answer. A failed lookup isn't cached.
	const artworkCache = new Map();
	const artworkByContentKey = new Map();
	const artworkInFlight = new Map();
	const artworkQueue = [];
	const artworkQueued = new Set();
	let artworkPrefetchActive = 0;
	let artworkLookupsDisabled = false;
	let artworkConsecutiveFailures = 0;
	let artworkNotifyTimer = null;

	const scheduleArtworkNotify = () => {
		if (artworkNotifyTimer) return;
		// A backlog can resolve dozens a second, so the hero redraws once for a burst of them.
		artworkNotifyTimer = setTimeout(() => {
			artworkNotifyTimer = null;
			artworkListeners.forEach((listener) => listener());
		}, 200);
	};

	const fetchArtworkSource = async (program) => {
		let result;
		try {
			const raw = await api.getLiveTvProgram(program.Id);
			result = raw ? artworkSource(raw) : null;
		} catch {
			artworkConsecutiveFailures++;
			if (artworkConsecutiveFailures >= ARTWORK_FAILURE_LIMIT) {
				artworkLookupsDisabled = true;
				artworkQueue.length = 0;
				artworkQueued.clear();
			}
			return null;
		}
		artworkConsecutiveFailures = 0;
		insertWithCap(artworkCache, program.Id, result);
		insertWithCap(artworkByContentKey, contentKeyFor(program), result);
		scheduleArtworkNotify();
		return result;
	};

	const artworkSourceFor = (program) => {
		const own = artworkSource(program);
		if (own) return Promise.resolve(own);
		if (artworkCache.has(program.Id)) return Promise.resolve(artworkCache.get(program.Id));
		const contentKey = contentKeyFor(program);
		if (artworkByContentKey.has(contentKey)) {
			const result = artworkByContentKey.get(contentKey);
			insertWithCap(artworkCache, program.Id, result);
			return Promise.resolve(result);
		}
		if (artworkLookupsDisabled) return Promise.resolve(null);
		if (artworkInFlight.has(program.Id)) return artworkInFlight.get(program.Id);
		const pending = fetchArtworkSource(program).then((result) => {
			artworkInFlight.delete(program.Id);
			return result;
		});
		artworkInFlight.set(program.Id, pending);
		return pending;
	};

	const pumpArtworkPrefetch = () => {
		while (!disposed && artworkPrefetchActive < ARTWORK_PREFETCH_CONCURRENCY && artworkQueue.length) {
			const program = artworkQueue.shift();
			artworkQueued.delete(program.Id);
			if (artworkCache.has(program.Id)) continue;
			artworkPrefetchActive++;
			artworkSourceFor(program).then(() => {
				artworkPrefetchActive--;
				if (!disposed) pumpArtworkPrefetch();
			});
		}
	};

	// Queues programs for a throttled background lookup. With replace, work still waiting for a
	// viewport the viewer has moved away from is dropped first.
	const queueArtworkPrefetch = (programs, {replace = false} = {}) => {
		if (replace) {
			artworkQueue.length = 0;
			artworkQueued.clear();
		}
		if (artworkLookupsDisabled) return;
		const horizon = now() + ARTWORK_PREFETCH_HORIZON;
		for (const program of programs) {
			if (programStart(program) > horizon) continue;
			if (artworkSource(program)) continue;
			if (artworkCache.has(program.Id) || artworkQueued.has(program.Id)) continue;
			artworkQueued.add(program.Id);
			artworkQueue.push(program);
		}
		pumpArtworkPrefetch();
	};

	const dispose = () => {
		disposed = true;
		programGeneration++;
		loadGeneration++;
		cancelBoundaryRefresh();
		clearTimeout(artworkNotifyTimer);
		artworkQueue.length = 0;
		artworkQueued.clear();
		artworkInFlight.clear();
		artworkCache.clear();
		artworkByContentKey.clear();
		listeners.clear();
		artworkListeners.clear();
	};

	return {
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		subscribeArtwork: (listener) => {
			artworkListeners.add(listener);
			return () => artworkListeners.delete(listener);
		},
		get state () { return state; },
		get error () { return error; },
		get sortBy () { return sort; },
		get filter () { return filter; },
		get guideWindow () { return guideWindow; },
		get guideDate () { return guideDate; },
		get windowStart () { return windowStart; },
		get windowEnd () { return windowEnd; },
		get atLivePosition () { return atLivePosition; },
		get filteredChannels () { return filteredChannels(); },
		get hasMorePrograms () { return hasMorePrograms(); },
		get programsHighWater () { return isCategoryFilter(filter) ? categoryPrograms.size : programsHighWater; },
		get boundaryDueAt () { return boundaryDueAt; },
		hasProgramsFor,
		programsForChannel,
		unfilteredProgramsForChannel: (id) => programsByChannel.get(id) || [],
		channelForId,
		setSortBy,
		setFilter,
		setDate,
		setWindowStart,
		goToNow,
		load,
		loadMorePrograms,
		ensureProgramsForChannels,
		toggleChannelFavorite,
		toggleProgramRecording,
		toggleSeriesRecording,
		scheduleBoundaryRefresh,
		refreshAtQuarterHour,
		refreshCarouselPrograms,
		cancelBoundaryRefresh,
		hasArtworkResult: (id) => artworkCache.has(id),
		cachedArtworkFor: (id) => artworkCache.get(id) || null,
		artworkSourceFor,
		queueArtworkPrefetch,
		dispose
	};
};
