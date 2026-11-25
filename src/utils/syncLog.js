// SyncPlay's trail: what the group sent, what the set did about it and when.
// It goes into the diagnostic report while the user is recording one, so a set
// that won't keep step can be diagnosed from an uploaded report, and to the
// console otherwise. The logger service attaches the sink, the same way as the
// network trace, so this module depends on nothing.

let sink = null;

export const setSyncLogSink = (fn) => {
	sink = typeof fn === 'function' ? fn : null;
};

const format = (arg) => {
	if (arg && typeof arg === 'object') {
		try { return JSON.stringify(arg); } catch { return String(arg); }
	}
	return String(arg);
};

export const syncLog = (...args) => {
	if (sink) {
		sink(args.map(format).join(' '));
	} else {
		console.log(...args);
	}
};
