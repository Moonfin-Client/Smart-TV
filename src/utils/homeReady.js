// Start-up calls that nothing on Home needs wait until Home has shown, so they don't compete with
// it on a slow TV. They still go out after a while if Home never shows.
const SETTLE_MS = 2000;
const FALLBACK_MS = 10000;

let ready = null;
let markReady = null;

const readyPromise = () => {
	if (!ready) {
		ready = new Promise((resolve) => {
			markReady = resolve;
			setTimeout(resolve, FALLBACK_MS);
		});
	}
	return ready;
};

export const markHomeReady = () => {
	readyPromise();
	markReady();
};

let settled = null;

// One wait for everyone, so once start-up is over a later call goes straight through.
export const afterHomeReady = () => {
	if (!settled) settled = readyPromise().then(() => new Promise((resolve) => setTimeout(resolve, SETTLE_MS)));
	return settled;
};
