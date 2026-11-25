// The stop report for whatever is playing, sent by the shell when the app goes
// to the background. Page scripts are frozen there, so the page keeps the shell
// up to date on every progress tick and the shell does the final call itself.
import type {PlaybackSession} from './bridge';

let current: PlaybackSession | null = null;

export const setPlaybackSession = (session: PlaybackSession | null) => {
	current = session;
};

export const sendStopReport = async () => {
	const session = current;
	if (!session) return;
	current = null;
	try {
		await fetch(session.stopUrl, {method: 'POST', headers: session.headers, body: session.body});
	} catch (e) {
		console.warn('[moonfin] stop report failed', e);
	}
};
