import {useCallback, useEffect, useRef} from 'react';
import Spotlight from '@enact/spotlight';
import {nextMusicNode, rowNode, spotlightIdForNode} from './musicFocus';

const SCROLL_PAD = 16;
const FOCUS_ATTEMPTS = 6;

// Owns the scroller, the node elements and the focus calls. Every callback here
// is identity stable because MediaRow's memo comparator ignores callbacks, so an
// unstable one would leave a row holding a stale closure.
const useMusicBrowseFocus = (chain) => {
	const scrollerRef = useRef(null);
	const nodeRefs = useRef(new Map());
	const chainRef = useRef(chain);
	const lastNodeRef = useRef(null);
	const rafRef = useRef(null);
	chainRef.current = chain;

	const scrollToNode = useCallback((node) => {
		const container = scrollerRef.current;
		const el = nodeRefs.current.get(node);
		if (!container || !el) return;
		// offsetTop is measured against the offset parent, so the scroller has to
		// be the positioned one or this counts the header in as well.
		container.scrollTop = Math.max(0, el.offsetTop - SCROLL_PAD);
	}, []);

	const focusNode = useCallback((node) => {
		const id = spotlightIdForNode(node);
		if (!id) return;
		lastNodeRef.current = node;
		// Scroll first: focusing something offscreen lets the browser scroll it in
		// on its own terms and undo this.
		scrollToNode(node);
		if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
		let attempts = 0;
		const tryFocus = () => {
			rafRef.current = null;
			if (Spotlight.focus(id)) return;
			// A row that just mounted isn't registered yet on this frame.
			attempts += 1;
			if (attempts < FOCUS_ATTEMPTS) rafRef.current = window.requestAnimationFrame(tryFocus);
		};
		rafRef.current = window.requestAnimationFrame(tryFocus);
	}, [scrollToNode]);

	useEffect(() => () => {
		if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
	}, []);

	const registerRowRef = useCallback((rowIndex, el) => {
		const key = rowNode(rowIndex);
		if (el) nodeRefs.current.set(key, el);
		else nodeRefs.current.delete(key);
	}, []);

	const registerNode = useCallback((key, el) => {
		if (el) nodeRefs.current.set(key, el);
		else nodeRefs.current.delete(key);
	}, []);

	const handleRowNavigateUp = useCallback((rowIndex) => {
		const next = nextMusicNode(chainRef.current, rowNode(rowIndex), 'up');
		if (next) focusNode(next);
	}, [focusNode]);

	const handleRowNavigateDown = useCallback((rowIndex) => {
		const next = nextMusicNode(chainRef.current, rowNode(rowIndex), 'down');
		if (next) focusNode(next);
	}, [focusNode]);

	const handleRowFocus = useCallback((rowIndex) => {
		lastNodeRef.current = rowNode(rowIndex);
	}, []);

	return {
		scrollerRef,
		chainRef,
		lastNodeRef,
		registerRowRef,
		registerNode,
		focusNode,
		handleRowNavigateUp,
		handleRowNavigateDown,
		handleRowFocus
	};
};

export default useMusicBrowseFocus;
