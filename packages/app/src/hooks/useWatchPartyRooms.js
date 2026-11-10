import {useEffect, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';
import {watchParty, mergePartyRooms, syncPlayGroupFrom} from '../services/siloWatchParty';
import {listGroups} from '../services/syncPlay';

// Anything can ask App to open the Watch Parties screen, the settings drawer and Home among them.
const OPEN_EVENT = 'moonfin:watchParties';
export const openWatchParties = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT));
export const onOpenWatchParties = (listener) => {
	window.addEventListener(OPEN_EVENT, listener);
	return () => window.removeEventListener(OPEN_EVENT, listener);
};

// While Watch Parties or SyncPlay is up over Settings, Settings leaves Back to it, so one press closes only the dialog.
let watchTogetherOpen = false;
export const isWatchTogetherOpen = () => watchTogetherOpen;

/**
 * Closing Watch Parties or SyncPlay goes back to what opened it: the settings row, a Home card, the nav button. Not when
 * it closed because the party's player opened (`toPlayer`), which takes focus itself.
 */
export const useWatchTogetherReturn = (open, toPlayer) => {
	const toPlayerRef = useRef(toPlayer);
	toPlayerRef.current = toPlayer;
	useEffect(() => {
		if (!open) return undefined;
		watchTogetherOpen = true;
		const returnTo = Spotlight.getCurrent();
		return () => {
			watchTogetherOpen = false;
			if (!toPlayerRef.current && returnTo && document.body.contains(returnTo)) Spotlight.focus(returnTo);
		};
	}, [open]);
};

/**
 * What hosts parties for the signed-in server: `backend` is silo or moonbase (null on a server with neither), and
 * `available` says whether it can host them now. Moonbase's `config` comes along. Asked again when `sessionKey` changes.
 */
export const useWatchPartyBackend = (sessionKey) => {
	const [state, setState] = useState({backend: null, available: false, checked: false, config: null});
	useEffect(() => {
		let live = true;
		const backend = watchParty.backend();
		setState({backend, available: false, checked: !backend, config: null});
		if (!backend) return undefined;
		Promise.all([watchParty.available(), watchParty.config()]).then(([available, config]) => {
			if (live) setState({backend, available, checked: true, config});
		});
		return () => {
			live = false;
		};
	}, [sessionKey]);
	return state;
};

/**
 * The parties this user can join, Moonbase's and, with `withSyncPlay`, Jellyfin's SyncPlay groups, asked every
 * `intervalMs` while `active` and again when the app comes back to the front. Never while the app is in the background.
 * `rooms` is null until the first answer.
 */
const useWatchPartyRooms = ({active, intervalMs = 60000, withSyncPlay = false}) => {
	const [rooms, setRooms] = useState(null);

	useEffect(() => {
		if (!active) return undefined;
		let live = true;
		const run = async () => {
			if (document.hidden) return;
			const [parties, groups] = await Promise.all([
				watchParty.available().then((ok) => (ok ? watchParty.listRooms() : [])).catch(() => null),
				withSyncPlay ? listGroups() : []
			]);
			// A failed read keeps what was there rather than emptying the row.
			if (!live || parties === null) return;
			const next = mergePartyRooms(parties, groups.map(syncPlayGroupFrom));
			// The same answer keeps the same list, so Home doesn't redraw its rows for nothing.
			setRooms((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
		};
		run();
		const timer = setInterval(run, intervalMs);
		const onVisible = () => {
			if (!document.hidden) run();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			live = false;
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, [active, intervalMs, withSyncPlay]);

	return {rooms};
};

export default useWatchPartyRooms;
