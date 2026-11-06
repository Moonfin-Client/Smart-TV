// Rows arrive in waves: the cache first, then each loader as it finishes, then the volatile
// refresh on its own timer. The reducer folds each wave in without disturbing the rows that
// are already on screen.

import {mergeRowPreservingRefs} from '../../utils/volatileRows';
import {extendRow} from './rowPaging';

export const browseInitialState = {
	isLoading: true,
	browseMode: 'featured',
	allRowData: [],
	featuredItems: [],
	pendingSections: []
};

const dedupeById = (rows) => {
	const unique = [];
	const seen = new Set();
	(rows || []).forEach((row) => {
		if (row && row.id && !seen.has(row.id)) {
			seen.add(row.id);
			unique.push(row);
		}
	});
	return unique;
};

// An incoming row wins and keeps the position of the row it replaces, and new ids go on the
// end. Keeping the existing row would leave a stale copy on screen with no way through for
// the fresh one.
export function mergeRowsById (existingRows, incomingRows) {
	const incoming = new Map();
	incomingRows.forEach((row) => {
		if (row && row.id) incoming.set(row.id, row);
	});
	const merged = existingRows.map((row) => {
		if (!row || !incoming.has(row.id)) return row;
		const replacement = incoming.get(row.id);
		incoming.delete(row.id);
		return replacement;
	});
	return [...merged, ...incoming.values()];
}

export default function browseReducer (state, action) {
	switch (action.type) {
		case 'SET_INITIAL_DATA':
			return {
				...state,
				isLoading: false,
				allRowData: dedupeById(action.rowData),
				featuredItems: action.featuredItems || state.featuredItems
			};
		case 'APPEND_ROWS': {
			if (action.rows.length === 0) return state;
			return {...state, allRowData: mergeRowsById(state.allRowData, action.rows)};
		}
		case 'REFRESH_VOLATILE': {
			const prevVolatile = new Map();
			state.allRowData.forEach((row) => {
				if (row.id === 'resume' || row.id === 'nextup') prevVolatile.set(row.id, row);
			});
			const mergedVolatile = action.volatileRows.map((row) => mergeRowPreservingRefs(prevVolatile.get(row.id), row));
			const filtered = state.allRowData.filter((r) => r.id !== 'resume' && r.id !== 'nextup');
			const next = [...mergedVolatile, ...filtered];
			// Returning the same state when nothing moved is what keeps a refresh that found
			// no changes from rerendering every row.
			if (next.length === state.allRowData.length &&
				next.every((row, i) => row === state.allRowData[i])) {
				return state;
			}
			return {...state, allRowData: next};
		}
		case 'EXTEND_ROW': {
			const index = state.allRowData.findIndex((row) => row.id === action.id);
			if (index < 0 || state.allRowData[index].readHead !== action.readHead) return state;
			const allRowData = state.allRowData.slice();
			allRowData[index] = extendRow(allRowData[index], action.items, action.hasMore);
			return {...state, allRowData};
		}
		case 'SET_ROW_DATA':
			return {...state, allRowData: dedupeById(action.rowData)};
		case 'SET_LOADING':
			if (state.isLoading === action.value) return state;
			return {...state, isLoading: action.value};
		case 'SET_BROWSE_MODE':
			if (state.browseMode === action.mode) return state;
			return {...state, browseMode: action.mode};
		case 'SET_FEATURED_ITEMS':
			return {...state, featuredItems: action.items};
		case 'SET_PENDING_SECTIONS':
			if (action.sections.length === 0 && state.pendingSections.length === 0) return state;
			return {...state, pendingSections: action.sections};
		case 'SECTIONS_DONE': {
			const pendingSections = state.pendingSections.filter((id) => !action.sections.includes(id));
			if (pendingSections.length === state.pendingSections.length) return state;
			return {...state, pendingSections};
		}
		default:
			return state;
	}
}
