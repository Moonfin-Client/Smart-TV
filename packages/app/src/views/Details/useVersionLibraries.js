import {useState, useEffect, useMemo, useRef} from 'react';

// The library each of an item's versions sits in, keyed by media source id.
//
// The server sends no library on a media source, but every version is an item in
// its own right and its id is the source id, so the collection folder above it is
// the library it came from. A name only lands here when the libraries differ,
// since naming them helps nobody when every version shares one.

const NO_LIBRARIES = {};

const useVersionLibraries = (item, api) => {
	const [libraries, setLibraries] = useState(NO_LIBRARIES);

	// The versions decide the lookup, so the same item arriving again as a fresh
	// object must not send it round a second time. The effect splits the ids back
	// out, because an array would be new on every render and refire forever.
	const sourceKey = useMemo(() => {
		const sources = item?.MediaSources || [];
		if (sources.length < 2) return '';
		return sources.map((source) => source.Id).filter(Boolean).join(',');
	}, [item]);

	const apiRef = useRef(api);
	apiRef.current = api;

	useEffect(() => {
		const sourceIds = sourceKey ? sourceKey.split(',') : [];
		const getAncestors = apiRef.current?.getAncestors;
		if (!getAncestors || sourceIds.length < 2) {
			setLibraries(NO_LIBRARIES);
			return undefined;
		}
		let cancelled = false;
		// One lookup per version, in parallel, and a version whose lookup fails
		// simply goes unnamed rather than holding the rest up.
		Promise.all(sourceIds.map((id) => getAncestors(id).catch(() => null))).then((results) => {
			if (cancelled) return;
			const names = {};
			results.forEach((ancestors, index) => {
				const library = Array.isArray(ancestors)
					? ancestors.find((ancestor) => ancestor.Type === 'CollectionFolder')
					: null;
				const name = library?.Name?.trim();
				if (name) names[sourceIds[index]] = name;
			});
			setLibraries(new Set(Object.values(names)).size > 1 ? names : NO_LIBRARIES);
		});
		return () => {
			cancelled = true;
		};
	}, [sourceKey]);

	return libraries;
};

export default useVersionLibraries;
