// SyncPlay's trail: what the group sent, what the set did about it and when.
//
// It goes to the console, where an inspector can read it, and into the
// diagnostic report whenever the user is recording one, so a set that will not
// keep step can be diagnosed from a report uploaded to the server rather than
// from a debugger cable. The sink is attached by the logger service, the same
// way as the network trace, so this depends on nothing and the console path
// costs one null check.

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
