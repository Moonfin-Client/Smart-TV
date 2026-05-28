import * as multiServerManager from './multiServerManager';
import {formatErrorMessage, requestJson, requestText} from './pluginHttp';

const HOME_SCREEN_SECTIONS_PLUGIN_GUID = 'b8298e01-2697-407a-b44d-aa8dc795e850';
const KEFIN_JS_ENDPOINTS = ['/JavaScriptInjector/private.js', '/JavaScriptInjector/public.js'];
const DEFAULT_TIMEOUT_MS = 12000;

const readPluginIdentifier = (plugin) => {
	if (!plugin || typeof plugin !== 'object') return '';
	const id = plugin.id || plugin.Id || plugin.guid || plugin.Guid || plugin.assemblyGuid || plugin.AssemblyGuid || '';
	return String(id).toLowerCase();
};

const readPluginVersion = (plugin) => {
	if (!plugin || typeof plugin !== 'object') return null;
	const version = plugin.version || plugin.Version || null;
	return version ? String(version) : null;
};

const normalizeSectionInfo = (item) => {
	if (!item || typeof item !== 'object') return null;
	const section = String(item.Section || item.section || '');
	const displayText = String(item.DisplayText || item.displayText || item.Name || item.name || section);
	const additionalData = item.AdditionalData || item.additionalData || null;
	if (!section && !displayText) return null;
	return {
		section,
		displayText,
		additionalData: additionalData == null ? null : String(additionalData)
	};
};

const parseSectionList = (payload) => {
	const raw = Array.isArray(payload)
		? payload
		: Array.isArray(payload?.Items)
			? payload.Items
			: [];
	return raw
		.map(normalizeSectionInfo)
		.filter((entry) => !!entry);
};

const safeJsonParse = (value) => {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
};

const resolveServerLabel = (server) => {
	const serverName = server.name || server.serverId || 'Server';
	if (!server.username) return serverName;
	return `${serverName} (${server.username})`;
};

const probeHomeScreenSectionsServer = async (server) => {
	const base = {
		serverId: server.serverId,
		serverName: server.name,
		serverLabel: resolveServerLabel(server),
		serverUrl: server.url,
		userId: server.userId,
		username: server.username || null,
		installed: false,
		enabled: false,
		pluginVersion: null,
		sections: [],
		sectionCount: 0,
		available: false,
		lastError: null
	};

	let pluginVersion = null;
	let installedByPluginList = false;

	const plugins = await requestJson({
		serverUrl: server.url,
		endpoint: '/Plugins',
		token: server.accessToken,
		timeoutMs: DEFAULT_TIMEOUT_MS
	}).catch(() => null);
	if (Array.isArray(plugins)) {
		const found = plugins.find((plugin) => readPluginIdentifier(plugin) === HOME_SCREEN_SECTIONS_PLUGIN_GUID);
		if (found) {
			installedByPluginList = true;
			pluginVersion = readPluginVersion(found);
		}
	}

	let meta = null;
	let metaError = null;
	try {
		meta = await requestJson({
			serverUrl: server.url,
			endpoint: '/HomeScreen/Meta',
			token: server.accessToken,
			timeoutMs: DEFAULT_TIMEOUT_MS
		});
	} catch (error) {
		metaError = error;
	}

	if (!installedByPluginList && metaError?.status === 404) {
		return base;
	}

	const installed = installedByPluginList || !!meta;
	const enabled = !!(meta && (meta.Enabled ?? meta.enabled));
	let sections = [];
	let sectionsError = null;

	if (installed && enabled) {
		const query = server.userId ? `?userId=${encodeURIComponent(server.userId)}` : '';
		try {
			const payload = await requestJson({
				serverUrl: server.url,
				endpoint: `/HomeScreen/Sections${query}`,
				token: server.accessToken,
				timeoutMs: DEFAULT_TIMEOUT_MS
			});
			sections = parseSectionList(payload);
		} catch (error) {
			sectionsError = error;
		}
	}

	return {
		...base,
		installed,
		enabled,
		pluginVersion,
		sections,
		sectionCount: sections.length,
		available: installed && enabled,
		lastError: formatErrorMessage(sectionsError || (metaError?.status === 404 ? null : metaError))
	};
};

const extractStrictConfigAssignment = (source) => {
	const match = /window\.KefinTweaksConfig\s*=\s*({[\s\S]*?});/m.exec(source);
	return match?.[1] || null;
};

const matchBrace = (source, openIndex) => {
	let depth = 0;
	let inString = false;
	let quote = '';
	let isEscaped = false;

	for (let i = openIndex; i < source.length; i += 1) {
		const ch = source[i];
		if (isEscaped) {
			isEscaped = false;
			continue;
		}
		if (inString) {
			if (ch === '\\') {
				isEscaped = true;
				continue;
			}
			if (ch === quote) {
				inString = false;
				quote = '';
			}
			continue;
		}
		if (ch === '"' || ch === "'" || ch === '`') {
			inString = true;
			quote = ch;
			continue;
		}
		if (ch === '{') {
			depth += 1;
		} else if (ch === '}') {
			depth -= 1;
			if (depth === 0) return i;
		}
	}

	return -1;
};

const extractConfigObject = (source) => {
	const marker = 'window.KefinTweaksConfig';
	let searchFrom = 0;

	while (true) {
		const markerIndex = source.indexOf(marker, searchFrom);
		if (markerIndex < 0) return null;

		const eqIndex = source.indexOf('=', markerIndex + marker.length);
		if (eqIndex < 0) return null;

		const braceIndex = source.indexOf('{', eqIndex);
		if (braceIndex < 0) return null;

		const endIndex = matchBrace(source, braceIndex);
		if (endIndex > 0) {
			return source.slice(braceIndex, endIndex + 1);
		}
		searchFrom = markerIndex + marker.length;
	}
};

const stripJsComments = (input) => {
	let output = '';
	let inString = false;
	let quote = '';
	let isEscaped = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let i = 0; i < input.length; i += 1) {
		const ch = input[i];
		const next = i + 1 < input.length ? input[i + 1] : '';

		if (inLineComment) {
			if (ch === '\n' || ch === '\r') {
				inLineComment = false;
				output += ch;
			}
			continue;
		}

		if (inBlockComment) {
			if (ch === '*' && next === '/') {
				inBlockComment = false;
				i += 1;
			}
			continue;
		}

		if (isEscaped) {
			output += ch;
			isEscaped = false;
			continue;
		}

		if (inString) {
			output += ch;
			if (ch === '\\') {
				isEscaped = true;
			} else if (ch === quote) {
				inString = false;
				quote = '';
			}
			continue;
		}

		if (ch === '/' && next === '/') {
			inLineComment = true;
			i += 1;
			continue;
		}

		if (ch === '/' && next === '*') {
			inBlockComment = true;
			i += 1;
			continue;
		}

		if (ch === '"' || ch === "'" || ch === '`') {
			inString = true;
			quote = ch;
		}

		output += ch;
	}

	return output;
};

const jsObjectToJson = (input) => {
	let output = stripJsComments(input);
	output = output.replace(/([\{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
	output = output.replace(/'((?:\\.|[^'\\])*)'/g, (_match, group1) => {
		const escaped = String(group1).replace(/"/g, '\\"');
		return `"${escaped}"`;
	});
	output = output.replace(/,\s*([}\]])/g, '$1');
	return output;
};

const parseKefinConfig = (source) => {
	const strict = extractStrictConfigAssignment(source);
	if (strict) {
		const strictDecoded = safeJsonParse(strict);
		if (strictDecoded && typeof strictDecoded === 'object') {
			return strictDecoded;
		}
	}

	const rawObject = extractConfigObject(source);
	if (!rawObject) return null;

	const parsed = safeJsonParse(jsObjectToJson(rawObject));
	return parsed && typeof parsed === 'object' ? parsed : null;
};

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const toInt = (value, fallback) => {
	const n = Number(value);
	return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const parseMmDd = (value) => {
	if (!value || typeof value !== 'string') return null;
	const parts = value.split('-');
	if (parts.length < 2) return null;
	const month = Number(parts[0]);
	const day = Number(parts[1]);
	if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	return {month, day};
};

const compareMonthDay = (a, b) => {
	if (a.month !== b.month) return a.month - b.month;
	return a.day - b.day;
};

const isSeasonalActive = (now, startMmDd, endMmDd) => {
	const start = parseMmDd(startMmDd);
	const end = parseMmDd(endMmDd);
	if (!start || !end) return false;

	const today = {month: now.getMonth() + 1, day: now.getDate()};
	if (compareMonthDay(start, end) <= 0) {
		return compareMonthDay(today, start) >= 0 && compareMonthDay(today, end) <= 0;
	}
	return compareMonthDay(today, start) >= 0 || compareMonthDay(today, end) <= 0;
};

const buildKefinSections = (config) => {
	const homeScreen = isObject(config?.homeScreen) ? config.homeScreen : {};
	const defaultLimit = toInt(homeScreen.defaultItemLimit, 16);
	const sections = [];

	const pushSection = (id, displayText, order, spec) => {
		sections.push({
			id: `kefin:${id}`,
			displayText,
			order: toInt(order, 999),
			spec
		});
	};

	const recentlyReleased = isObject(homeScreen.recentlyReleased) ? homeScreen.recentlyReleased : null;
	const recentMovies = isObject(recentlyReleased?.movies) ? recentlyReleased.movies : null;
	const recentEpisodes = isObject(recentlyReleased?.episodes) ? recentlyReleased.episodes : null;

	if (recentlyReleased?.enabled !== false && recentMovies?.enabled !== false) {
		pushSection('recentlyReleasedMovies', recentMovies?.name || 'Recently Released Movies', recentMovies?.order ?? 21, {
			kind: 'recentlyReleasedMovies',
			limit: toInt(recentMovies?.itemLimit, defaultLimit)
		});
	}

	if (recentlyReleased?.enabled !== false && recentEpisodes?.enabled !== false) {
		pushSection('recentlyReleasedEpisodes', recentEpisodes?.name || 'Recently Released Episodes', recentEpisodes?.order ?? 22, {
			kind: 'recentlyReleasedEpisodes',
			limit: toInt(recentEpisodes?.itemLimit, defaultLimit)
		});
	}

	const watchAgain = isObject(homeScreen.watchAgain) ? homeScreen.watchAgain : null;
	if (watchAgain?.enabled !== false) {
		pushSection('watchAgain', watchAgain?.name || 'Watch Again', watchAgain?.order ?? 50, {
			kind: 'watchAgain',
			limit: toInt(watchAgain?.itemLimit, defaultLimit)
		});
	}

	const recentlyAddedInLibrary = isObject(homeScreen.recentlyAddedInLibrary) ? homeScreen.recentlyAddedInLibrary : null;
	if (recentlyAddedInLibrary) {
		const libraryIds = [];
		Object.entries(recentlyAddedInLibrary).forEach(([libraryId, cfg]) => {
			if (isObject(cfg) && cfg.enabled === false) return;
			libraryIds.push(libraryId);
		});
		if (libraryIds.length > 0) {
			pushSection('recentlyAddedInLibrary', 'Recently Added', 90, {
				kind: 'recentlyAddedInLibrary',
				libraryIds,
				limit: defaultLimit
			});
		}
	}

	const seasonal = isObject(homeScreen.seasonal) ? homeScreen.seasonal : null;
	if (seasonal) {
		const now = new Date();
		Object.entries(seasonal).forEach(([key, value]) => {
			if (!isObject(value) || value.enabled === false) return;
			if (!isSeasonalActive(now, String(value.startDate || ''), String(value.endDate || ''))) return;

			pushSection(`seasonal:${key}`, String(value.name || key), value.order ?? 60, {
				kind: 'custom',
				type: String(value.type || 'genre'),
				source: String(value.source || ''),
				sortBy: String(value.sortOrder || 'Random'),
				sortOrderDirection: String(value.sortOrderDirection || 'Ascending'),
				includeItemTypes: Array.isArray(value.includeItemTypes)
					? value.includeItemTypes.map((entry) => String(entry)).filter(Boolean)
					: ['Movie'],
				limit: toInt(value.itemLimit, defaultLimit)
			});
		});
	}

	const customSections = Array.isArray(homeScreen.customSections) ? homeScreen.customSections : [];
	customSections.forEach((entry, index) => {
		if (!isObject(entry) || entry.enabled === false) return;
		const type = String(entry.type || 'genre');
		const source = String(entry.source || '');
		const id = entry.id ? String(entry.id) : `${type}:${source}:${index}`;
		pushSection(`custom:${id}`, String(entry.name || 'Custom'), entry.order ?? (100 + index), {
			kind: 'custom',
			type,
			source,
			sortBy: String(entry.sortOrder || 'Random'),
			sortOrderDirection: String(entry.sortOrderDirection || 'Ascending'),
			includeItemTypes: Array.isArray(entry.includeItemTypes)
				? entry.includeItemTypes.map((item) => String(item)).filter(Boolean)
				: ['Movie', 'Series'],
			limit: toInt(entry.limit, defaultLimit)
		});
	});

	sections.sort((a, b) => a.order - b.order);
	return sections;
};

const probeKefinTweaksServer = async (server) => {
	const base = {
		serverId: server.serverId,
		serverName: server.name,
		serverLabel: resolveServerLabel(server),
		serverUrl: server.url,
		userId: server.userId,
		username: server.username || null,
		installed: false,
		enabled: false,
		version: null,
		endpointUsed: null,
		sections: [],
		sectionCount: 0,
		available: false,
		lastError: null
	};

	let jsContent = null;
	let endpointUsed = null;
	let endpointError = null;

	for (const endpoint of KEFIN_JS_ENDPOINTS) {
		try {
			const body = await requestText({
				serverUrl: server.url,
				endpoint,
				token: server.accessToken,
				timeoutMs: DEFAULT_TIMEOUT_MS,
				accept: 'text/plain,*/*;q=0.8'
			});
			if (typeof body === 'string' && body.trim()) {
				jsContent = body;
				endpointUsed = endpoint;
				break;
			}
		} catch (error) {
			endpointError = error;
		}
	}

	if (!jsContent) {
		return {
			...base,
			lastError: formatErrorMessage(endpointError)
		};
	}

	const config = parseKefinConfig(jsContent);
	if (!config) {
		return {
			...base,
			endpointUsed,
			lastError: 'Config parse failed'
		};
	}

	const homeScreen = isObject(config.homeScreen) ? config.homeScreen : {};
	const enabled = homeScreen.enabled !== false;
	const sections = enabled ? buildKefinSections(config) : [];

	return {
		...base,
		installed: true,
		enabled,
		version: config.version ? String(config.version) : null,
		endpointUsed,
		sections,
		sectionCount: sections.length,
		available: enabled
	};
};

const compareByServer = (a, b) => {
	const serverNameA = (a.serverName || '').toLowerCase();
	const serverNameB = (b.serverName || '').toLowerCase();
	if (serverNameA !== serverNameB) return serverNameA.localeCompare(serverNameB);
	const userA = (a.username || '').toLowerCase();
	const userB = (b.username || '').toLowerCase();
	return userA.localeCompare(userB);
};

const getServerSessions = async () => {
	const servers = await multiServerManager.getAllServersArray();
	if (!Array.isArray(servers)) return [];
	return servers.filter((server) => !!(server?.url && server?.accessToken));
};

export const probeHomeScreenSectionsCapabilities = async () => {
	const sessions = await getServerSessions();
	if (sessions.length === 0) return [];
	const capabilities = await Promise.all(sessions.map((server) => probeHomeScreenSectionsServer(server)));
	return capabilities.sort(compareByServer);
};

export const probeKefinTweaksCapabilities = async () => {
	const sessions = await getServerSessions();
	if (sessions.length === 0) return [];
	const capabilities = await Promise.all(sessions.map((server) => probeKefinTweaksServer(server)));
	return capabilities.sort(compareByServer);
};
