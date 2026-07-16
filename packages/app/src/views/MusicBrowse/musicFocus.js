import {KEYS} from '../../utils/keys';

// The music library's vertical focus chain: header, hero, chips, then a stop per
// row. The rows own left and right themselves, so this only walks up and down.
export const HEADER = 'header';
export const HERO = 'hero';
export const CHIPS = 'chips';

export const rowNode = (index) => `row:${index}`;
const isRowNode = (node) => typeof node === 'string' && node.startsWith('row:');
const rowIndexOf = (node) => parseInt(node.slice(4), 10);

export const MUSIC_FOCUS_IDS = {
	[HEADER]: 'music-header',
	[HERO]: 'music-hero',
	[CHIPS]: 'music-chips',
	home: 'music-home-btn',
	filter: 'music-filter-btn',
	panel: 'music-filter-panel'
};

// The hero drops out when the library has nothing to feature. The chips never
// do, so there is always a stop between the header and the rows.
export const buildMusicChain = ({hasHero, rowCount}) => [
	HEADER,
	...(hasHero ? [HERO] : []),
	CHIPS,
	...Array.from({length: rowCount}, (_, i) => rowNode(i))
];

export const nextMusicNode = (chain, current, direction) => {
	const index = chain.indexOf(current);
	if (index < 0) return null;
	const next = index + (direction === 'up' ? -1 : 1);
	if (next < 0 || next >= chain.length) return null;
	return chain[next];
};

// Rows come and go with the visibility settings, so a node remembered from
// before a reload can name a row that is no longer there. Snap to the nearest
// row that survived rather than leaving focus nowhere.
export const clampMusicNode = (chain, node) => {
	if (chain.includes(node)) return node;
	if (isRowNode(node)) {
		const rows = chain.filter(isRowNode);
		if (rows.length > 0) return rows[Math.min(rowIndexOf(node), rows.length - 1)];
		return chain.includes(CHIPS) ? CHIPS : chain[0];
	}
	return chain[0];
};

export const spotlightIdForNode = (node) => (
	isRowNode(node) ? `row-${rowIndexOf(node)}` : MUSIC_FOCUS_IDS[node] || null
);

// Returns true when the key was ours. Both ends of the chain swallow the key:
// the library panel has no navbar, so handing it back to Spotlight would only
// drop focus.
export const handleMusicFocusKey = (e, {node, chain, focusNode}) => {
	const isUp = e.keyCode === KEYS.UP;
	const isDown = e.keyCode === KEYS.DOWN;
	if (!isUp && !isDown) return false;

	e.preventDefault();
	e.stopPropagation();

	const next = nextMusicNode(chain, node, isUp ? 'up' : 'down');
	if (next) focusNode(next);
	return true;
};
