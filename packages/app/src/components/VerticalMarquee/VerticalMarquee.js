import {useEffect, useRef} from 'react';
import {rem} from '../../utils/rootScale';

import css from './VerticalMarquee.module.less';

const setOffset = (node, offset, duration) => {
	node.style.webkitTransition = duration > 0 ? `-webkit-transform ${duration}ms linear` : 'none';
	node.style.transition = duration > 0 ? `transform ${duration}ms linear` : 'none';
	node.style.webkitTransform = `translateY(${-offset}px)`;
	node.style.transform = `translateY(${-offset}px)`;
};

// About the pace subtitle guidelines allow, slow enough to read from across the room.
const READING_CHARS_PER_SECOND = 17;

// One pixel up brings in a whole line of words, so the pace and the holds come from reading time
// rather than distance. The first hold lasts as long as the visible lines take to read and the end
// hold as long as one of them, and pauseMs is the shortest either can be.
export const readingPace = ({chars, textHeight, viewportHeight, lines, pauseMs}) => {
	const msPerChar = 1000 / READING_CHARS_PER_SECOND;
	const visibleMs = chars * viewportHeight / textHeight * msPerChar;
	return {
		holdMs: Math.max(pauseMs, Math.round(visibleMs)),
		scrollMs: Math.round(chars * (textHeight - viewportHeight) / textHeight * msPerChar),
		endHoldMs: Math.max(pauseMs, Math.round(visibleMs / lines))
	};
};

// Text longer than its lines scrolls up through the rest at reading pace, holds on the last lines,
// then snaps back and starts over. The line height is in design pixels.
const VerticalMarquee = ({text, lines, lineHeight, pauseMs, className}) => {
	const viewportRef = useRef(null);
	const contentRef = useRef(null);
	const height = lines * lineHeight;

	useEffect(() => {
		const content = contentRef.current;
		const viewport = viewportRef.current;
		if (!content || !viewport) return undefined;
		setOffset(content, 0, 0);
		const textHeight = content.scrollHeight;
		const maxOffset = textHeight - viewport.clientHeight;
		if (maxOffset <= 0.5) return undefined;

		const {holdMs, scrollMs, endHoldMs} = readingPace({
			chars: content.textContent.length,
			textHeight,
			viewportHeight: viewport.clientHeight,
			lines,
			pauseMs
		});
		let timer = null;
		const cycle = () => {
			timer = setTimeout(() => {
				setOffset(content, maxOffset, scrollMs);
				timer = setTimeout(() => {
					setOffset(content, 0, 0);
					cycle();
				}, scrollMs + endHoldMs);
			}, holdMs);
		};
		cycle();
		return () => clearTimeout(timer);
	}, [text, height, lines, pauseMs]);

	return (
		<div ref={viewportRef} className={`${css.viewport} ${className || ''}`} style={{maxHeight: rem(height)}}>
			<div ref={contentRef} className={css.content}>{text}</div>
		</div>
	);
};

export default VerticalMarquee;
