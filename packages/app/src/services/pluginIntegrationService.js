import * as multiServerManager from './multiServerManager';
import {probeHomeScreenSectionsCapabilities} from './pluginCapabilityProbe';
import {formatErrorMessage, requestJsonForSession} from './pluginHttp';

const PROBE_CACHE_TTL_MS = 90 * 1000;
const ROWS_CACHE_TTL_MS = 90 * 1000;
const BACKOFF_STEPS_MS = [0, 5000, 15000, 30000, 60000];
const SECTION_FETCH_CONCURRENCY = 4;

const createProbeState = () => ({
	data: [],
	updatedAt: 0,
	lastAttemptAt: 0,
	failureCount: 0,
	nextRetryAt: 0,
	lastError: null,
	lastSource: 'empty'
});

const probeCacheState = {
	home: createProbeState(),
};

const pluginRowsCacheState = {
	rows: [],
	updatedAt: 0,
	lastError: null
};

const nowMs = () => Date.now();

const cloneArray = (value) => (Array.isArray(value) ? value.map((entry) => ({...entry})) : []);

const resetProbeState = (state) => {
	state.data = [];
	state.updatedAt = 0;
	state.lastAttemptAt = 0;
	state.failureCount = 0;
	state.nextRetryAt = 0;
	state.lastError = null;
	state.lastSource = 'empty';
};

const resolveBackoffDelay = (failureCount) => {
	const index = Math.min(Math.max(failureCount, 0), BACKOFF_STEPS_MS.length - 1);
	return BACKOFF_STEPS_MS[index];
};

const buildProbeMeta = (state, source, blockedByBackoff) => ({
	source,
	blockedByBackoff: !!blockedByBackoff,
	updatedAt: state.updatedAt || null,
	cacheAgeMs: state.updatedAt ? Math.max(0, nowMs() - state.updatedAt) : null,
	failureCount: state.failureCount,
	nextRetryAt: state.nextRetryAt || null,
	lastError: state.lastError,
	ttlMs: PROBE_CACHE_TTL_MS
});

const extractItems = (payload) => {
	if (Array.isArray(payload)) return payload;
	if (Array.isArray(payload?.Items)) return payload.Items;
	return [];
};

const identityKey = (serverId, userId) => `${String(serverId || '')}::${String(userId || '')}`;

const buildQueryString = (params = {}) => {
	const parts = [];
	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null || value === '') return;
		parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
	});
	return parts.join('&');
};

const mapWithConcurrency = async (tasks, concurrency, mapper) => {
	if (!Array.isArray(tasks) || tasks.length === 0) return [];

	const limit = Number.isFinite(Number(concurrency))
		? Math.max(1, Math.trunc(Number(concurrency)))
		: 1;
	const results = new Array(tasks.length);
	let nextIndex = 0;

	const worker = async () => {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			if (currentIndex >= tasks.length) return;
			results[currentIndex] = await mapper(tasks[currentIndex], currentIndex);
		}
	};

	const workerCount = Math.min(limit, tasks.length);
	await Promise.all(Array.from({length: workerCount}, () => worker()));
	return results;
};

const sanitizeKey = (value) => {
	const clean = String(value || '')
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return clean || 'section';
};

const rowTypeFromItems = (items) => {
	if (!Array.isArray(items) || items.length === 0) return 'portrait';
	const sample = items.find((item) => !!item?.Type);
	const type = sample?.Type;
	if (type === 'Episode' || type === 'Program' || type === 'CollectionFolder') return 'landscape';
	if (type === 'MusicAlbum' || type === 'Audio' || type === 'MusicArtist') return 'square';
	return 'portrait';
};

const tagItemsWithServer = (items, session) => {
	return (items || []).map((item) => ({
		...item,
		_serverId: session.serverId,
		_serverName: session.name,
		_serverUrl: session.url,
		_serverUserId: session.userId,
		_serverType: session.serverType || 'jellyfin'
	}));
};

const getLoggedInSessions = async () => {
	const sessions = await multiServerManager.getAllServersArray();
	if (!Array.isArray(sessions)) return [];
	return sessions.filter((entry) => !!(entry?.url && entry?.accessToken && entry?.userId));
};

const sortRows = (rows) => {
	return [...rows].sort((a, b) => {
		if (a.pluginSource !== b.pluginSource) {
			return a.pluginSource.localeCompare(b.pluginSource);
		}
		if ((a.pluginOrder || 0) !== (b.pluginOrder || 0)) {
			return (a.pluginOrder || 0) - (b.pluginOrder || 0);
		}
		return (a.title || '').localeCompare(b.title || '');
	});
};

const loadHomeSectionRows = async (capabilities, sessionsByKey) => {
	const includeServerName = sessionsByKey.size > 1;
	const tasks = [];

	for (const capability of capabilities) {
		if (!capability?.available || !Array.isArray(capability.sections)) continue;
		const session = sessionsByKey.get(identityKey(capability.serverId, capability.userId));
		if (!session) continue;

		for (const section of capability.sections) {
			tasks.push({capability, session, section});
		}
	}

	const rows = await mapWithConcurrency(tasks, SECTION_FETCH_CONCURRENCY, async (task) => {
		const {capability, session, section} = task;
		const sectionKey = String(section.section || section.displayText || 'section');
		const query = buildQueryString({
			userId: session.userId,
			additionalData: section.additionalData || undefined
		});
		const endpoint = `/HomeScreen/Section/${encodeURIComponent(section.section || '')}${query ? `?${query}` : ''}`;

		try {
			const payload = await requestJsonForSession(session, endpoint);
			const items = tagItemsWithServer(extractItems(payload), session);
			if (items.length === 0) return null;
			const titleBase = section.displayText || section.section || 'Home Screen Section';
			const title = includeServerName ? `${titleBase} (${capability.serverLabel || session.name})` : titleBase;
			return {
				id: `plugin-hss-${sanitizeKey(session.serverId)}-${sanitizeKey(session.userId)}-${sanitizeKey(sectionKey)}`,
				title,
				items,
				type: rowTypeFromItems(items),
				isPluginRow: true,
				pluginSource: 'hss',
				pluginServerId: session.serverId,
				pluginUserId: session.userId,
				pluginSectionKey: sectionKey
			};
		} catch {
			return null;
		}
	});

	return rows
		.filter((row) => !!row)
		.map((row, index) => ({
			...row,
			pluginOrder: index
		}));
};

const refreshProbeGroup = async (key, fetcher, options = {}) => {
	const state = probeCacheState[key];
	const now = nowMs();
	const forceRefresh = options.forceRefresh === true;
	const bypassBackoff = options.bypassBackoff === true;
	const hasCachedData = Array.isArray(state.data) && state.data.length > 0;
	const cacheFresh = hasCachedData && (now - state.updatedAt) < PROBE_CACHE_TTL_MS;

	if (!forceRefresh && cacheFresh) {
		state.lastSource = 'cache';
		return {
			capabilities: cloneArray(state.data),
			meta: buildProbeMeta(state, 'cache', false)
		};
	}

	if (!forceRefresh && !bypassBackoff && state.nextRetryAt && state.nextRetryAt > now) {
		state.lastSource = 'backoff';
		return {
			capabilities: cloneArray(state.data),
			meta: buildProbeMeta(state, 'backoff', true)
		};
	}

	state.lastAttemptAt = now;
	try {
		const capabilities = await fetcher();
		state.data = Array.isArray(capabilities) ? capabilities : [];
		state.updatedAt = nowMs();
		state.failureCount = 0;
		state.nextRetryAt = 0;
		state.lastError = null;
		state.lastSource = 'network';
		return {
			capabilities: cloneArray(state.data),
			meta: buildProbeMeta(state, 'network', false)
		};
	} catch (error) {
		state.failureCount += 1;
		state.lastError = formatErrorMessage(error);
		const backoffDelay = resolveBackoffDelay(state.failureCount);
		state.nextRetryAt = nowMs() + backoffDelay;
		state.lastSource = hasCachedData ? 'stale' : 'error';
		return {
			capabilities: hasCachedData ? cloneArray(state.data) : [],
			meta: buildProbeMeta(state, hasCachedData ? 'stale' : 'error', backoffDelay > 0)
		};
	}
};

const snapshotProbeCacheState = () => {
	const now = nowMs();
	const mapState = (state) => ({
		updatedAt: state.updatedAt || null,
		cacheAgeMs: state.updatedAt ? Math.max(0, now - state.updatedAt) : null,
		failureCount: state.failureCount,
		nextRetryAt: state.nextRetryAt || null,
		lastError: state.lastError,
		lastSource: state.lastSource,
		entryCount: Array.isArray(state.data) ? state.data.length : 0,
		ttlMs: PROBE_CACHE_TTL_MS
	});

	return {
		home: mapState(probeCacheState.home),
		rows: {
			updatedAt: pluginRowsCacheState.updatedAt || null,
			cacheAgeMs: pluginRowsCacheState.updatedAt ? Math.max(0, now - pluginRowsCacheState.updatedAt) : null,
			lastError: pluginRowsCacheState.lastError,
			rowCount: Array.isArray(pluginRowsCacheState.rows) ? pluginRowsCacheState.rows.length : 0,
			ttlMs: ROWS_CACHE_TTL_MS
		},
		backoffStepsMs: [...BACKOFF_STEPS_MS]
	};
};

export const refreshPluginCapabilities = async (options = {}) => {
	const [homeResult] = await Promise.all([
		refreshProbeGroup('home', () => probeHomeScreenSectionsCapabilities(), options),
	]);

	return {
		homeSectionsCapabilities: homeResult.capabilities,
		meta: {
			home: homeResult.meta,
			cache: snapshotProbeCacheState()
		}
	};
};

export const loadDiscoveredPluginRows = async (options = {}) => {
	const forceRefresh = options.forceRefresh === true;
	const now = nowMs();
	if (!forceRefresh && pluginRowsCacheState.updatedAt && (now - pluginRowsCacheState.updatedAt) < ROWS_CACHE_TTL_MS) {
		return cloneArray(pluginRowsCacheState.rows);
	}

	const capabilityResult = await refreshPluginCapabilities(options);
	const sessions = await getLoggedInSessions();
	const sessionsByKey = new Map();
	sessions.forEach((session) => {
		sessionsByKey.set(identityKey(session.serverId, session.userId), session);
	});

	try {
		const [homeRows] = await Promise.all([
			loadHomeSectionRows(capabilityResult.homeSectionsCapabilities, sessionsByKey),
		]);
		const rows = sortRows([...homeRows]);
		pluginRowsCacheState.rows = rows;
		pluginRowsCacheState.updatedAt = nowMs();
		pluginRowsCacheState.lastError = null;
		return cloneArray(rows);
	} catch (error) {
		pluginRowsCacheState.lastError = formatErrorMessage(error);
		if (pluginRowsCacheState.rows.length > 0) {
			return cloneArray(pluginRowsCacheState.rows);
		}
		return [];
	}
};

export const clearPluginProbeCache = () => {
	resetProbeState(probeCacheState.home);
	pluginRowsCacheState.rows = [];
	pluginRowsCacheState.updatedAt = 0;
	pluginRowsCacheState.lastError = null;
};

export const getPluginProbeCacheState = () => snapshotProbeCacheState();
