import {useState, useEffect, useMemo, useRef} from 'react';

import {getDeduplicationKey} from '../../utils/mediaDedup';
import * as connectionPool from '../../services/connectionPool';

// The servers holding this same title. Rows and search show one card for a title
// however many servers have it, so this is what was folded away, offered back.

const NO_SERVERS = [];

// The types a row shows as a card and folds copies of. A season or a person is
// reached through its own screen, which has no action row to raise a button on.
const PICKER_TYPES = ['Movie', 'Series', 'Episode', 'Video', 'MusicVideo'];

const useDetailsServers = (item, enabled) => {
	const [serverSources, setServerSources] = useState(NO_SERVERS);

	// The same key the rows collapse copies by, so marking a title watched leaves
	// it alone while the ids arriving with the full record do send it round.
	const lookupKey = useMemo(() => getDeduplicationKey(item), [item]);

	const itemRef = useRef(item);
	itemRef.current = item;

	useEffect(() => {
		if (!enabled || !PICKER_TYPES.includes(itemRef.current?.Type)) {
			setServerSources(NO_SERVERS);
			return undefined;
		}
		let cancelled = false;
		connectionPool.getItemCopiesFromAllServers(itemRef.current).then((copies) => {
			if (!cancelled) setServerSources(copies);
		}).catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [enabled, lookupKey]);

	return serverSources;
};

export default useDetailsServers;
