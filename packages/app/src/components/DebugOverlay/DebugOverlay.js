import {useEffect, useRef, useState} from 'react';

// Simple Debugger that shows on the right side the consol of the TV
// Red button on rmeote toggles it

const MAX_LINES = 200;

const buffer = [];
const listeners = new Set();
let installed = false;

const stringify = (value) => {
	if (value instanceof Error) return value.stack || value.message;
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value);
	try { return JSON.stringify(value); }
	catch { return Object.prototype.toString.call(value); }
};

const push = (level, args) => {
	const ts = new Date().toISOString().slice(11, 23);
	const text = Array.prototype.map.call(args, stringify).join(' ');
	buffer.push({ts, level, text});
	if (buffer.length > MAX_LINES) buffer.splice(0, buffer.length - MAX_LINES);
	listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
};

const installHooks = () => {
	if (installed || typeof window === 'undefined') return;
	installed = true;
	const orig = {
		log: console.log.bind(console),
		info: console.info.bind(console),
		warn: console.warn.bind(console),
		error: console.error.bind(console)
	};
	console.log = function () { push('L', arguments); orig.log.apply(null, arguments); };
	console.info = function () { push('I', arguments); orig.info.apply(null, arguments); };
	console.warn = function () { push('W', arguments); orig.warn.apply(null, arguments); };
	console.error = function () { push('E', arguments); orig.error.apply(null, arguments); };
	window.addEventListener('error', (e) => push('E', [`window.onerror: ${e.message} @ ${e.filename}:${e.lineno}`]));
	window.addEventListener('unhandledrejection', (e) => push('E', [`unhandledrejection: ${stringify(e.reason)}`]));
};

installHooks();

const KEY_RED = 403;
const KEY_GREEN = 404;
const KEY_YELLOW = 405;

const colorForLevel = (level) => {
	if (level === 'E') return '#ff6b6b';
	if (level === 'W') return '#ffd166';
	if (level === 'I') return '#7fc8ff';
	return '#d0d0d0';
};

const DebugOverlay = () => {
	const [visible, setVisible] = useState(false);
	const [, force] = useState(0);
	const preRef = useRef(null);

	useEffect(() => {
		const onChange = () => force((n) => (n + 1) % 1000000);
		listeners.add(onChange);
		return () => { listeners.delete(onChange); };
	}, []);

	useEffect(() => {
		const onKey = (e) => {
			const code = e.keyCode || e.which;
			if (code === KEY_RED) { setVisible((v) => !v); e.preventDefault(); e.stopPropagation(); }
			else if (code === KEY_GREEN) { buffer.length = 0; force((n) => n + 1); e.preventDefault(); e.stopPropagation(); }
			else if (code === KEY_YELLOW) {
				// Dump buffer to localStorage so we can retrieve later
				try { localStorage.setItem('moonfin_debug_log', JSON.stringify(buffer)); } catch { /* ignore */ }
				push('I', ['[debug] saved log to localStorage moonfin_debug_log']);
				e.preventDefault(); e.stopPropagation();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, []);

	useEffect(() => {
		if (visible && preRef.current) {
			preRef.current.scrollTop = preRef.current.scrollHeight;
		}
	});

	if (!visible) return null;

	return (
		<div
			style={{
				position: 'fixed',
				top: 0,
				right: 0,
				width: '50%',
				height: '100%',
				background: 'rgba(0,0,0,0.85)',
				color: '#d0d0d0',
				font: '14px/1.3 monospace',
				zIndex: 2147483647,
				pointerEvents: 'none',
				padding: '8px',
				boxSizing: 'border-box'
			}}
		>
			<div style={{color: '#7fc8ff', marginBottom: 4}}>
				DEBUG OVERLAY — RED toggle · GREEN clear · YELLOW save · {buffer.length}/{MAX_LINES}
			</div>
			<pre
				ref={preRef}
				style={{
					margin: 0,
					height: 'calc(100% - 24px)',
					overflowY: 'auto',
					whiteSpace: 'pre-wrap',
					wordBreak: 'break-all'
				}}
			>
				{buffer.map((entry, i) => (
					<div key={i} style={{color: colorForLevel(entry.level)}}>
						{entry.ts} {entry.level} {entry.text}
					</div>
				))}
			</pre>
		</div>
	);
};

export default DebugOverlay;
