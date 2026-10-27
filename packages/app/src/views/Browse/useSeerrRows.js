import {useEffect, useState} from 'react';

import {getSeerrHomeRowConfigs, fetchSeerrHomeRow, normalizeMediaItem, SEERR_SECTION_TO_CONFIG} from '../../utils/seerrHomeRows';
import {loadSliderHomeRow} from '../../utils/seerrSliders';
import {isSameServer, isSeerrSliderRow} from '../../utils/pickedRows';
import {sortExternalItems} from '../../utils/externalHomeRows';

// The discover rows Seerr provides. They are fetched separately from the library rows because
// they come from a different server and only exist while Seerr is connected and signed in. The
// rows still on their way come back as [pending], so they can hold their place.
const useSeerrRows = ({seerrEnabled, seerrAuthenticated, seerrUserId, homeRows, serverUrl, sortBy, sortOrder}) => {
	const [seerrRows, setSeerrRows] = useState([]);
	const [pending, setPending] = useState([]);

	useEffect(() => {
		if (!seerrEnabled || !seerrAuthenticated) {
			setSeerrRows([]);
			setPending([]);
			return undefined;
		}
		const enabledSections = (homeRows || []).filter((r) => r.enabled && SEERR_SECTION_TO_CONFIG[r.id]);
		const sliderRows = (homeRows || []).filter((r) => r.enabled && isSeerrSliderRow(r) && isSameServer(r.serverUrl, serverUrl));
		if (enabledSections.length === 0 && sliderRows.length === 0) {
			setSeerrRows([]);
			setPending([]);
			return undefined;
		}

		let cancelled = false;
		const configs = getSeerrHomeRowConfigs();
		const configFor = (section) => configs.find((c) => c.id === SEERR_SECTION_TO_CONFIG[section.id]);
		setPending([
			...enabledSections.filter(configFor).map((section) => ({id: section.id, title: configFor(section).title})),
			...sliderRows.map((row) => ({id: row.id, title: row.name}))
		]);

		const settle = () => {
			if (!cancelled) setPending([]);
		};

		(async () => {
			const built = await Promise.all(enabledSections.map(async (section) => {
				const configId = SEERR_SECTION_TO_CONFIG[section.id];
				const cfg = configFor(section);
				if (!cfg) return null;
				const items = await fetchSeerrHomeRow(configId, {userId: seerrUserId});
				if (!items.length) return null;
				return {
					id: section.id,
					title: cfg.title,
					items: cfg.type === 'shortcut' ? items : sortExternalItems(items, sortBy, sortOrder),
					type: cfg.cardType,
					isSeerrRow: true,
					isTileRow: cfg.type === 'genre' || cfg.type === 'studio' || cfg.type === 'network' || cfg.type === 'shortcut'
				};
			}));
			const builtSliders = await Promise.all(sliderRows.map(async (row) => {
				const loaded = await loadSliderHomeRow(row).catch(() => null);
				if (!loaded?.results.length) return null;
				return {
					id: row.id,
					title: loaded.slider.title,
					items: sortExternalItems(loaded.results.map(normalizeMediaItem), sortBy, sortOrder),
					type: 'portrait',
					isSeerrRow: true
				};
			}));
			if (!cancelled) setSeerrRows([...built, ...builtSliders].filter(Boolean));
		})().then(settle, settle);

		return () => {
			cancelled = true;
		};
	}, [seerrEnabled, seerrAuthenticated, seerrUserId, homeRows, serverUrl, sortBy, sortOrder]);

	return {rows: seerrRows, pending};
};

export default useSeerrRows;
