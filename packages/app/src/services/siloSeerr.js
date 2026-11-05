// The request screens on Silo, through Silo's own requests feature (/api/v2/requests) instead of a Seerr server. Ported
// from Moonfin-Core's SiloSeerrHttpClient.
//
// The screens speak Seerr's API, so each Seerr path is answered here with Silo's reply rewritten into the JSON Seerr
// would have sent. What Silo has no counterpart for (issues, people, collections, quotas, Radarr and Sonarr choices)
// answers empty, and those parts of the screens show their empty state. The Discover rows an admin adds on Silo come
// through as search sliders whose query names the row.
//
// Seerr's ids are integers. Silo's request ids are 64-bit numbers sent as text, and its genres and cast have names but
// no ids, so the ids handed to the screens are looked up in tables that map them back.

const MEDIA_UNKNOWN = 1;
const MEDIA_PENDING = 2;
const MEDIA_PROCESSING = 3;
const MEDIA_PARTIAL = 4;
const MEDIA_AVAILABLE = 5;

const REQUEST_PENDING = 1;
const REQUEST_APPROVED = 2;
const REQUEST_DECLINED = 3;
const REQUEST_FAILED = 4;
const REQUEST_COMPLETED = 5;

// Seerr's permission bits.
const PERM_MANAGE_REQUESTS = 16;
const PERM_REQUEST = 32;
const PERM_REQUEST_MOVIE = 262144;
const PERM_REQUEST_TV = 524288;

// Silo's six built-in rows are the app's own trending, popular and upcoming rows.
const BUILT_IN_ROWS = ['trending_movies', 'trending_series', 'popular_movies', 'popular_series', 'upcoming_movies', 'on_air_series'];
// Title rows Silo serves through /requests/discover/rows/{key}.
const TITLE_ROW_TYPES = ['tmdb_chart', 'tmdb_discover', 'tmdb_list', 'mdblist'];
// What a slider made from a Silo row carries as its search query, which Seerr never sends with this prefix.
export const SILO_ROW_PREFIX = 'silo-row:';
// Seerr's search slider type.
const SLIDER_SEARCH = 17;

const EMPTY_PAGE = {page: 1, totalPages: 0, totalResults: 0, results: []};
const EMPTY_LIST = {pageInfo: {pages: 0, pageSize: 20, results: 0, page: 1}, results: []};

const seerrType = (kind) => (kind === 'series' ? 'tv' : 'movie');
const siloType = (type) => (type === 'tv' ? 'series' : 'movie');
const intOf = (v) => {
	const n = typeof v === 'number' ? v : parseInt(v, 10);
	return Number.isFinite(n) ? n : null;
};
const list = (v) => (Array.isArray(v) ? v : []);
// A query string's values by name. Old Tizen engines have no URLSearchParams.
const parseQuery = (query) => {
	const values = {};
	String(query || '').split('&').forEach((pair) => {
		if (!pair) return;
		const at = pair.indexOf('=');
		const name = decodeURIComponent((at < 0 ? pair : pair.slice(0, at)).replace(/\+/g, ' '));
		if (!(name in values)) values[name] = at < 0 ? '' : decodeURIComponent(pair.slice(at + 1).replace(/\+/g, ' '));
	});
	return {get: (name) => (name in values ? values[name] : null)};
};
const pageOf = (take, skip) => (take > 0 ? Math.floor(skip / take) + 1 : 1);

// A 31-bit FNV-1a hash, the same on every run, for ids made from names (genres, cast, row keys).
export const stableId = (text) => {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h & 0x7fffffff;
};

const mediaStatusOf = (availability, state) => {
	if (availability === 'available') return MEDIA_AVAILABLE;
	switch (state) {
		case 'pending': return MEDIA_PENDING;
		case 'approved': case 'processing': return MEDIA_PROCESSING;
		case 'partially_available': return MEDIA_PARTIAL;
		case 'available': return MEDIA_AVAILABLE;
		default: return MEDIA_UNKNOWN;
	}
};

const requestStatusOf = (state) => {
	switch (state) {
		case 'pending': return REQUEST_PENDING;
		case 'declined': case 'cancelled': return REQUEST_DECLINED;
		case 'failed': return REQUEST_FAILED;
		case 'available': return REQUEST_COMPLETED;
		default: return REQUEST_APPROVED;
	}
};

// Seerr's list filters as Silo's admin queue views.
const adminView = (filter) => ({
	pending: 'needs_approval', approved: 'in_progress', processing: 'in_progress', failed: 'failed', available: 'done',
	completed: 'done'
})[filter] || null;

// Whether a mapped request passes a Seerr list filter.
const matches = (request, filter) => {
	const media = request.media.status;
	switch (filter) {
		case 'pending': return request.status === REQUEST_PENDING;
		case 'approved': return request.status === REQUEST_APPROVED;
		case 'processing': return media === MEDIA_PROCESSING;
		case 'available': return media === MEDIA_AVAILABLE || media === MEDIA_PARTIAL;
		case 'unavailable': return media !== MEDIA_AVAILABLE;
		case 'failed': return request.status === REQUEST_FAILED;
		case 'completed': return request.status === REQUEST_COMPLETED;
		default: return true;
	}
};

const siloSort = (sortBy) => {
	const field = String(sortBy || '').split('.')[0];
	if (field === 'vote_average') return 'vote_average';
	if (field === 'primary_release_date' || field === 'first_air_date') return 'release_date';
	return 'popularity';
};

const shuffle = (items, random) => {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d) => d.toISOString().slice(0, 10);

/**
 * `call(path, options)` is a Silo request as the signed-in profile (siloApi's `siloCall`), throwing Silo's errors with
 * `status`. `baseUrl` makes Silo's relative artwork links whole. `random` is for tests.
 */
export const createSiloSeerr = ({call, baseUrl = '', random = Math.random}) => {
	// Silo request id by the integer the screens were given.
	const requestIds = {};
	const requestKeys = {};
	const genreSlugs = {};
	let admin = null;
	let me = 0;
	let myName = null;
	const accountNames = {};
	let accountNamesReadAt = 0;
	// Pages skipped at the start of a row on this visit, so the trending and popular rows don't open on the same titles
	// every time.
	const pageShift = {};

	const get = async (path, query) => (await call(`/api/v2${path}`, {query})) || {};

	const intId = (id) => {
		const n = Number(id);
		// Past 2^53 a number loses its last digits, so two requests could share one; those get a key of their own.
		const key = Number.isSafeInteger(n) && String(n) === id ? n : (requestKeys[id] || (requestKeys[id] = 0x10000000000 + Object.keys(requestKeys).length));
		requestIds[key] = id;
		return key;
	};
	const requestId = (key) => encodeURIComponent(requestIds[key] || String(key));

	// Whether the viewer can manage Silo's requests, which only Silo's acting admin can. Asked once.
	const isAdmin = async () => {
		if (admin != null) return admin;
		try {
			await call('/api/v2/admin/requests/capabilities');
			admin = true;
		} catch (err) {
			if (err.status !== 401 && err.status !== 403) throw err;
			admin = false;
		}
		return admin;
	};

	const accountName = (id) => accountNames[id] || (id === me ? myName : null);

	// Silo's requests name their requester by account id only. An admin, who sees everyone's, reads the account names
	// when one isn't known yet, at most once a minute.
	const addRequesterNames = async (shown) => {
		const unknown = shown.some((r) => r.requestedBy && !accountName(r.requestedBy.id));
		if (unknown && Date.now() - accountNamesReadAt > 60000 && await isAdmin()) {
			accountNamesReadAt = Date.now();
			try {
				let cursor = null;
				do {
					// eslint-disable-next-line no-await-in-loop
					const body = await get('/admin/users', {limit: 100, cursor});
					list(body.items).forEach((u) => {
						const id = intOf(u?.id);
						if (id != null && typeof u.username === 'string') accountNames[id] = u.username;
					});
					cursor = body.page?.next_cursor || null;
				} while (cursor);
			} catch {
				// The requests still list, as by an unknown requester.
			}
		}
		shown.forEach((r) => {
			const name = r.requestedBy && accountName(r.requestedBy.id);
			if (name) r.requestedBy.displayName = name;
		});
	};

	// Silo records requests against the account, while the app's user is a profile, so the account is the requests user.
	const currentUser = async () => {
		const manage = await isAdmin();
		const account = await get('/account/me');
		me = intOf(account.id) || 0;
		myName = account.username == null ? null : String(account.username);
		let permissions = PERM_REQUEST | PERM_REQUEST_MOVIE | PERM_REQUEST_TV;
		if (manage) permissions |= PERM_MANAGE_REQUESTS;
		return {id: me, displayName: account.username, permissions};
	};

	const status = async () => {
		const answer = await get('/requests/status');
		const enabled = answer.requests_enabled === true;
		const user = enabled ? await currentUser() : null;
		return {
			enabled,
			authenticated: enabled && answer.allowed !== false,
			seerrUserId: user?.id ?? null,
			displayName: user?.displayName ?? null,
			permissions: user?.permissions ?? 0
		};
	};

	// ---- Discovery

	const mediaInfo = (result) => {
		const req = result.request || {};
		const id = req.request_id == null ? '' : String(req.request_id);
		const state = req.state == null ? null : String(req.state);
		const info = {
			id: result.tmdb_id,
			tmdbId: result.tmdb_id,
			status: mediaStatusOf(result.availability, state),
			jellyfinMediaId: result.library_content_id,
			requests: id ? [{
				id: intId(id),
				status: requestStatusOf(state),
				type: seerrType(result.media_type),
				is4k: false,
				...(req.requested_by_viewer === true ? {requestedBy: {id: me}} : null)
			}] : []
		};
		if (Array.isArray(result.seasons)) {
			info.seasons = result.seasons.filter(Boolean).map((s) => ({
				seasonNumber: s.season_number,
				status: {available: MEDIA_AVAILABLE, partial: MEDIA_PARTIAL}[s.availability] ||
					(s.requested === true ? MEDIA_PROCESSING : MEDIA_UNKNOWN)
			}));
		}
		return info;
	};

	const discoverItem = (result) => {
		const type = seerrType(result.media_type);
		const item = {
			id: result.tmdb_id,
			mediaType: type,
			posterPath: result.poster_path,
			backdropPath: result.backdrop_path,
			overview: result.overview,
			voteAverage: result.vote_average,
			popularity: result.popularity,
			genreIds: [],
			adult: false,
			mediaInfo: mediaInfo(result)
		};
		if (type === 'tv') {
			item.name = result.title;
			item.firstAirDate = result.release_date;
		} else {
			item.title = result.title;
			item.releaseDate = result.release_date;
		}
		return item;
	};

	// `shift` is how many pages the row was moved on by.
	const page = (body, shift = 0) => {
		const results = list(body.results);
		const at = typeof body.page === 'number' ? body.page : 1;
		// Silo names the page to read next when page+1 would repeat titles, and the screens ask for page+1.
		const next = typeof body.next_page === 'number' ? body.next_page - 1 : at;
		const total = typeof body.total_pages === 'number' ? body.total_pages : 1;
		return {
			page: next - shift,
			totalPages: Math.max(total - shift, 1),
			totalResults: body.total_results ?? results.length,
			results: results.filter(Boolean).map(discoverItem)
		};
	};

	const section = async (key, at) => page(await get(`/requests/discover/${key}`, {page: at}));

	// One page of a Discover row. A shuffled row opens a random one of its first three pages, in a random order, so it's
	// different on each visit; later pages carry on from there.
	const row = async (key, path, at, shuffled = false) => {
		if (shuffled && at === 1) pageShift[key] = Math.floor(random() * 3);
		let shift = shuffled ? pageShift[key] || 0 : 0;
		let body = await get(path, {page: at + shift});
		if (shift > 0 && Array.isArray(body.results) && !body.results.length) {
			// A row shorter than the skip opens on its first page after all.
			pageShift[key] = shift = 0;
			body = await get(path, {page: at});
		}
		const out = page(body, shift);
		if (shuffled) shuffle(out.results, random);
		return out;
	};

	const builtIn = (key, at) => row(key, `/requests/discover/${key}`, at, true);

	// Trending films and series together, as Seerr's trending row has them.
	const trending = async (at) => {
		const pages = await Promise.all([builtIn('trending_movies', at), builtIn('trending_series', at)]);
		const results = shuffle([...pages[0].results, ...pages[1].results], random);
		return {
			page: Math.min(pages[0].page, pages[1].page),
			totalPages: Math.min(pages[0].totalPages, pages[1].totalPages),
			totalResults: results.length,
			results
		};
	};

	// Titles already in the library are left out: search lists them under the library's own results.
	const search = async (query, at) => {
		if (query.startsWith(SILO_ROW_PREFIX)) {
			const key = query.slice(SILO_ROW_PREFIX.length);
			return row(key, `/requests/discover/rows/${encodeURIComponent(key)}`, at, true);
		}
		const body = await get('/requests/search', {q: query, media_type: 'all', page: at});
		return page({...body, results: list(body.results).filter((r) => r && r.library_content_id == null)});
	};

	// The rows an admin added to Silo's Discover page, as search sliders. Their ids come from the row key, so a Home row
	// made from one keeps finding it.
	const sliders = async () => {
		const body = await get('/requests/discover');
		return list(body.row_order)
			.filter((r) => r && typeof r.key === 'string' && !BUILT_IN_ROWS.includes(r.key) && TITLE_ROW_TYPES.includes(r.type))
			.map((r) => ({id: stableId(r.key), type: SLIDER_SEARCH, enabled: true, title: r.title == null ? '' : String(r.title), data: `${SILO_ROW_PREFIX}${r.key}`}));
	};

	const genres = async () => {
		const body = await get('/requests/discover/genres');
		return list(body.items).filter((g) => g && typeof g.slug === 'string').map((g) => {
			const id = stableId(g.slug);
			genreSlugs[id] = g.slug;
			return {id, name: g.display_name || g.slug, backdrops: []};
		});
	};

	// Silo browses by one genre, studio or network at a time; the other filters have no counterpart.
	const browseGenre = async (genre, type, sortBy, at) => {
		const slug = genreSlugs[intOf(genre)];
		if (!slug) return section(type === 'tv' ? 'popular_series' : 'popular_movies', at);
		return page(await get(`/requests/discover/browse/genre/${encodeURIComponent(slug)}`, {
			media_type: siloType(type), sort: siloSort(sortBy), page: at
		}));
	};

	// A studio or network by its TMDB id, browsed through the slug Silo lists it under.
	const browseBrand = async (kind, tmdbId, sortBy, at) => {
		const brands = await get(`/requests/discover/${kind}s`);
		const brand = list(brands.items).find((b) => b && intOf(b.tmdb_id) === intOf(tmdbId));
		if (!brand) return EMPTY_PAGE;
		return page(await get(`/requests/discover/browse/${kind}/${encodeURIComponent(String(brand.slug))}`, {
			sort: siloSort(sortBy), page: at
		}));
	};

	const discover = (type, params, at) => {
		const brand = params.get(type === 'tv' ? 'network' : 'studio');
		if (brand) return browseBrand(type === 'tv' ? 'network' : 'studio', brand, params.get('sortBy'), at);
		return browseGenre(params.get('genre'), type, params.get('sortBy'), at);
	};

	// ---- Title detail

	const detail = (type, tmdbId) => get(`/requests/detail/${siloType(type)}/${encodeURIComponent(tmdbId)}`);

	const credits = (d) => ({
		cast: list(d.cast).filter(Boolean).map((c) => ({
			id: stableId(String(c.name)), name: c.name == null ? '' : String(c.name), character: c.character,
			profilePath: c.profile_path, order: c.order
		})),
		crew: [
			...(typeof d.director === 'string' && d.director ? [{id: stableId(d.director), name: d.director, job: 'Director', department: 'Directing'}] : []),
			...list(d.creators).filter((n) => typeof n === 'string').map((name) => ({id: stableId(name), name, job: 'Creator', department: 'Writing'}))
		]
	});

	const detailCommon = (d) => ({
		id: d.tmdb_id,
		tagline: d.tagline,
		posterPath: d.poster_path,
		backdropPath: d.backdrop_path,
		overview: d.overview,
		status: d.status,
		voteAverage: d.vote_average,
		voteCount: d.vote_count,
		genres: list(d.genres).filter((g) => typeof g === 'string').map((g) => ({id: stableId(g), name: g})),
		credits: credits(d),
		externalIds: {tmdbId: d.tmdb_id, tvdbId: d.tvdb_id, imdbId: d.imdb_id},
		mediaInfo: mediaInfo(d),
		keywords: [],
		relatedVideos: [],
		watchProviders: []
	});

	const movie = async (tmdbId) => {
		const d = await detail('movie', tmdbId);
		return {...detailCommon(d), mediaType: 'movie', title: d.title == null ? '' : String(d.title), releaseDate: d.release_date, runtime: d.runtime};
	};

	const tv = async (tmdbId) => {
		const d = await detail('tv', tmdbId);
		return {
			...detailCommon(d),
			mediaType: 'tv',
			name: d.title,
			firstAirDate: d.first_air_date ?? d.release_date,
			lastAirDate: d.last_air_date,
			numberOfSeasons: d.number_of_seasons,
			numberOfEpisodes: d.number_of_episodes,
			networks: list(d.networks).filter((n) => typeof n === 'string').map((n) => ({id: stableId(n), name: n})),
			seasons: list(d.seasons).filter(Boolean).map((s) => ({
				seasonNumber: s.season_number, name: s.name, episodeCount: s.episode_count, airDate: s.air_date, posterPath: s.poster_path
			}))
		};
	};

	// Silo has one list of recommendations on the detail, which stands in for similar titles too.
	const recommendations = async (type, tmdbId, at) => {
		if (at > 1) return EMPTY_PAGE;
		const recs = list((await detail(type, tmdbId)).recommendations);
		return page({page: 1, total_pages: 1, total_results: recs.length, results: recs});
	};

	// ---- Requests

	const mapRequest = (r) => {
		const type = seerrType(r.media_type);
		const state = r.state == null ? null : String(r.state);
		const requestStatus = requestStatusOf(state);
		const requestedBy = intOf(r.requested_by_user_id);
		const media = {
			id: r.tmdb_id, mediaType: type, tmdbId: r.tmdb_id, tvdbId: r.tvdb_id, imdbId: r.imdb_id,
			status: mediaStatusOf(null, state), posterPath: r.poster_path, backdropPath: r.backdrop_path,
			overview: r.overview, jellyfinMediaId: r.library_content_id
		};
		media[type === 'tv' ? 'name' : 'title'] = r.title;
		const seasons = list(r.seasons).filter((n) => typeof n === 'number');
		return {
			id: intId(String(r.id)),
			status: requestStatus,
			createdAt: r.created_at,
			updatedAt: r.updated_at,
			type,
			is4k: false,
			media,
			...(requestedBy != null ? {requestedBy: {id: requestedBy}} : null),
			seasonCount: seasons.length,
			seasons: seasons.map((n) => ({id: n, seasonNumber: n, status: requestStatus, createdAt: r.created_at, updatedAt: r.updated_at}))
		};
	};

	// Reads Silo's cursor pages until `count` requests are in hand or there are no more. Seerr pages by offset, Silo by
	// cursor, and the lists are short enough to read from the start.
	const readRequests = async (path, query, count, keep) => {
		const out = [];
		let cursor = null;
		let more = true;
		while (more && out.length < count) {
			// eslint-disable-next-line no-await-in-loop
			const body = await get(path, {...query, limit: 50, cursor});
			const items = list(body.items);
			items.filter(Boolean).map(mapRequest).filter(keep).forEach((r) => out.push(r));
			cursor = body.page?.next_cursor || null;
			more = Boolean(cursor) && items.length > 0;
		}
		return {requests: out, more};
	};

	const requests = async (params) => {
		const take = intOf(params.get('take')) ?? 20;
		const skip = intOf(params.get('skip')) ?? 0;
		const filter = params.get('filter');
		const by = intOf(params.get('requestedBy'));
		const manage = await isAdmin();
		const keep = (r) => matches(r, filter);
		const {requests: found, more} = !manage || (by != null && by === me)
			? await readRequests('/requests/mine', {}, skip + take, keep)
			: await readRequests('/admin/requests', {view: adminView(filter), requested_by_user_id: by == null ? null : String(by)}, skip + take, keep);
		const results = found.slice(skip, skip + take);
		await addRequesterNames(results);
		const known = found.length + (more ? 1 : 0);
		return {
			pageInfo: {pages: take > 0 ? Math.ceil(known / take) : 1, pageSize: take, results: known, page: pageOf(take, skip)},
			results
		};
	};

	// The badge on the requests screen counts what an admin has to approve.
	const requestCount = async () => {
		if (!await isAdmin()) return {};
		const pending = intOf((await get('/admin/requests/counts')).needs_approval) || 0;
		return {total: pending, pending};
	};

	// Silo's create takes the title and artwork, which Seerr looks up itself, so the detail is read first. Silo has no 4K
	// requests or per-request server choice, so those are left out.
	const createRequest = async (body) => {
		const type = body?.mediaType === 'tv' ? 'tv' : 'movie';
		const d = await detail(type, body.mediaId);
		const created = await call('/api/v2/requests', {method: 'POST', body: {
			media_type: siloType(type),
			tmdb_id: body.mediaId,
			...(d.tvdb_id != null ? {tvdb_id: d.tvdb_id} : null),
			...(typeof d.imdb_id === 'string' && d.imdb_id ? {imdb_id: d.imdb_id} : null),
			title: d.title == null ? '' : String(d.title),
			...(typeof d.year === 'number' && d.year > 0 ? {year: Math.trunc(d.year)} : null),
			...(d.overview != null ? {overview: d.overview} : null),
			...(d.poster_path != null ? {poster_path: d.poster_path} : null),
			...(d.backdrop_path != null ? {backdrop_path: d.backdrop_path} : null),
			...(type === 'tv' && Array.isArray(body.seasons) ? {seasons: body.seasons} : null)
		}});
		return created ? mapRequest(created) : {};
	};

	const watchlist = async (at) => {
		if (at > 1) return EMPTY_PAGE;
		const body = await get('/watchlist/titles', {limit: 100});
		const results = list(body.items).filter(Boolean).map((t) => discoverItem({...t, availability: 'missing'}));
		return {page: 1, totalPages: 1, totalResults: results.length, results};
	};

	const watchlistPath = (tmdbId, type) => `/api/v2/watchlist/titles/${siloType(type)}/${encodeURIComponent(tmdbId)}`;

	// ---- Calendar: Radarr's and Sonarr's, both from Silo's own (GET /calendar), which lists the releases and airings of
	// what the server holds.

	// The events of `type` from `start` to `end` (YYYY-MM-DD). Silo answers at most 31 days at a time.
	const calendarEvents = async (start, end, type) => {
		let from = new Date(`${start}T00:00:00Z`);
		const last = new Date(`${end}T00:00:00Z`);
		const found = [];
		while (from <= last) {
			const to = new Date(Math.min(from.getTime() + 30 * DAY_MS, last.getTime()));
			// eslint-disable-next-line no-await-in-loop
			const body = await get('/calendar', {start: isoDay(from), end: isoDay(to)});
			list(body.events).forEach((day) => list(day?.items).forEach((e) => {
				if (e?.type === type) found.push(e);
			}));
			from = new Date(to.getTime() + DAY_MS);
		}
		return found;
	};

	// The catalog entries the events point at, for their TMDB and TVDB ids, overview and backdrop, each read once.
	const calendarTitles = async (entries, idOf) => {
		const ids = entries.map(idOf).filter((id, i, all) => typeof id === 'string' && all.indexOf(id) === i);
		const found = {};
		for (let i = 0; i < ids.length; i += 5) {
			// eslint-disable-next-line no-await-in-loop
			await Promise.all(ids.slice(i, i + 5).map((id) => get(`/catalog/items/${encodeURIComponent(id)}`).then((t) => {
				found[id] = t;
			}, () => {})));
		}
		return found;
	};

	// Silo's artwork links are signed, so they load without the session.
	const absolute = (url) => (/^https?:/.test(url) ? url : `${String(baseUrl).replace(/\/+$/, '')}${url}`);
	const calendarImages = (poster, backdrop) => [
		...(typeof poster === 'string' && poster ? [{coverType: 'poster', remoteUrl: absolute(poster)}] : []),
		...(typeof backdrop === 'string' && backdrop ? [{coverType: 'fanart', remoteUrl: absolute(backdrop)}] : [])
	];

	// When it airs, in UTC: Silo gives the instant when it knows the network's time, else only the day, read as the start
	// of the viewer's day.
	const calendarInstant = (e) => {
		const at = Date.parse(e.air_at || '');
		if (!Number.isNaN(at)) return new Date(at).toISOString();
		const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.air_date || '');
		return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).toISOString() : null;
	};

	/** Silo's calendar as Radarr's (`movie`) or Sonarr's (`tv`) calendar answers. */
	const calendar = async (type, start, end) => {
		if (type === 'movie') {
			const releases = await calendarEvents(start, end, 'movie');
			const titles = await calendarTitles(releases, (e) => e.content_id);
			return releases.filter((e) => intOf(titles[e.content_id]?.tmdb_id) != null).map((e) => {
				const t = titles[e.content_id];
				return {
					tmdbId: intOf(t.tmdb_id), title: e.title, overview: t.overview, year: t.year,
					digitalRelease: calendarInstant(e), images: calendarImages(e.poster_url, t.backdrop_url)
				};
			});
		}
		const events = await calendarEvents(start, end, 'episode');
		const shows = await calendarTitles(events, (e) => e.series_id);
		return events.filter((e) => intOf(shows[e.series_id]?.tvdb_id) != null).map((e) => {
			const show = shows[e.series_id];
			return {
				series: {
					tvdbId: intOf(show.tvdb_id), tmdbId: intOf(show.tmdb_id), title: e.title, overview: show.overview,
					images: calendarImages(e.poster_url, show.backdrop_url)
				},
				title: e.episode_title, seasonNumber: e.season_number, episodeNumber: e.episode_number,
				airDateUtc: calendarInstant(e)
			};
		});
	};

	/** Answers one Seerr API path (`/discover/trending?page=2`) the way Seerr would, from Silo. */
	const request = async (endpoint, {method = 'GET', body} = {}) => {
		const [rawPath, rawQuery = ''] = String(endpoint).replace(/^\/+/, '').split('?');
		const params = parseQuery(rawQuery);
		const parts = rawPath.split('/');
		const at = intOf(params.get('page')) || 1;
		const verb = method.toUpperCase();

		if (parts[0] === 'request') {
			const id = intOf(parts[1]);
			if (verb === 'POST' && !parts[1]) return createRequest(body);
			if (parts[1] === 'count') return requestCount();
			if (!parts[1]) return requests(params);
			if (id == null) return {};
			// Seerr deletes a request; Silo cancels it, which keeps its history.
			if (verb === 'DELETE') return call(`/api/v2/requests/${requestId(id)}/cancel`, {method: 'POST', body: {}});
			if (['approve', 'decline', 'retry'].includes(parts[2])) {
				return call(`/api/v2/admin/requests/${requestId(id)}/${parts[2]}`, {method: 'POST', body: {}});
			}
			const one = mapRequest(await get(`/requests/${requestId(id)}`));
			await addRequesterNames([one]);
			return one;
		}
		if (parts[0] === 'watchlist') {
			if (verb === 'POST') return call(watchlistPath(body?.tmdbId, body?.mediaType), {method: 'PUT'});
			if (verb === 'DELETE') return call(watchlistPath(parts[1], params.get('mediaType')), {method: 'DELETE'});
			return watchlist(at);
		}
		if (parts[0] === 'auth' && parts[1] === 'me') return currentUser();
		if (parts[0] === 'search') return search(params.get('query') || '', at);
		if (parts[0] === 'settings' && parts[1] === 'discover') return sliders();
		if ((parts[0] === 'movie' || parts[0] === 'tv') && parts[1]) {
			if (parts[2] === 'recommendations' || parts[2] === 'similar') return recommendations(parts[0], parts[1], at);
			return parts[0] === 'movie' ? movie(parts[1]) : tv(parts[1]);
		}
		if (parts[0] === 'discover') {
			const [, kind, sub, brand] = parts;
			if (kind === 'trending') return trending(at);
			if (kind === 'watchlist') return watchlist(at);
			if (kind === 'genreslider') return genres();
			const type = kind === 'tv' ? 'tv' : 'movie';
			if (sub === 'upcoming') return section(type === 'tv' ? 'on_air_series' : 'upcoming_movies', at);
			if (sub === 'studio' || sub === 'network') return browseBrand(sub, brand, params.get('sortBy'), at);
			// Seerr's plain movie and series lists are its popular ones.
			if (!params.get('genre') && !params.get('studio') && !params.get('network')) {
				return builtIn(type === 'tv' ? 'popular_series' : 'popular_movies', at);
			}
			return discover(type, params, at);
		}
		if (parts[0] === 'issue') return parts[1] === 'count' ? {} : EMPTY_LIST;
		if (parts[0] === 'media') return {results: []};
		if (parts[0] === 'languages' || parts[0] === 'service' || parts[0] === 'blacklist') return parts[0] === 'blacklist' ? EMPTY_LIST : [];
		if (parts[0] === 'settings') return parts[1] === 'radarr' || parts[1] === 'sonarr' ? [] : {};
		// Quotas, people, collections: Silo has no counterpart.
		return {};
	};

	return {request, status, calendar};
};
