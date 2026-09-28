// Retains text while Search mounts. SendString.String replaces the entire query;
// an empty string clears it. Optional MoonfinInputId and MoonfinRevision reject
// edits from older input sessions.
export const createRemoteSearch = (inputId) => {
	let active = true;
	let text = '';
	let revision = -1;
	let onText = null;
	return {
		get active () { return active; },
		get opening () { return onText === null; },
		attach (listener) {
			if (!active) return;
			onText = listener;
			onText(text);
		},
		receive (args) {
			if (!active || typeof args.String !== 'string') return;
			if (args.MoonfinInputId != null) {
				const next = Number(args.MoonfinRevision);
				if (args.MoonfinInputId !== inputId || !/^\d+$/.test(args.MoonfinRevision || '') ||
					!Number.isSafeInteger(next) || next <= revision) return;
				revision = next;
			}
			text = args.String;
			if (onText) onText(text);
		},
		close () {
			active = false;
			onText = null;
		}
	};
};
