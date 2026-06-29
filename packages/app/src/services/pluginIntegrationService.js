
const PROBE_CACHE_TTL_MS = 90 * 1000;
const ROWS_CACHE_TTL_MS = 90 * 1000;
const BACKOFF_STEPS_MS = [0, 5000, 15000, 30000, 60000];

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

const resetProbeState = (state) => {
	state.data = [];
	state.updatedAt = 0;
	state.lastAttemptAt = 0;
	state.failureCount = 0;
	state.nextRetryAt = 0;
	state.lastError = null;
	state.lastSource = 'empty';
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

export const clearPluginProbeCache = () => {
	resetProbeState(probeCacheState.home);
	pluginRowsCacheState.rows = [];
	pluginRowsCacheState.updatedAt = 0;
	pluginRowsCacheState.lastError = null;
};

export const getPluginProbeCacheState = () => snapshotProbeCacheState();
