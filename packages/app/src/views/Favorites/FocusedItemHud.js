// The line of detail above the grid, describing whatever card is focused.

import {useEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';

import RatingsRow from '../../components/RatingsRow';
import {useSettings} from '../../context/SettingsContext';
import {isMdblistEnabled} from '../../services/mdblistApi';
import {formatDuration, videoResolutionLabel} from '../../utils/helpers';

import css from './FocusedItemHud.module.less';

// Ratings are fetched per item, so a card the focus only swept across never gets
// asked for. The name and the metadata still change on the focus itself.
const RATINGS_DEBOUNCE_MS = 250;

const titleFor = (item) => {
	if (item.Type === 'Episode' && item.SeriesName) {
		return `${item.SeriesName} - ${item.Name}`;
	}
	return item.Name;
};

const FocusedItemHud = ({item, serverUrl}) => {
	const {settings} = useSettings();
	const [ratingsItem, setRatingsItem] = useState(null);
	const timeoutRef = useRef(null);

	useEffect(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		if (!item) {
			setRatingsItem(null);
			return undefined;
		}
		timeoutRef.current = setTimeout(() => setRatingsItem(item), RATINGS_DEBOUNCE_MS);
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, [item]);

	if (!item) return <div className={css.hud} />;

	const runtime = item.Type === 'Series' ? '' : formatDuration(item.RunTimeTicks);
	const resolution = videoResolutionLabel(item);
	const status = item.Type === 'Series' ? item.Status : null;

	return (
		<div className={css.hud}>
			<div className={css.body} key={item.Id}>
				<div className={css.title}>{titleFor(item)}</div>

				<div className={css.metaRow}>
					{item.ProductionYear ? <span className={css.metaText}>{item.ProductionYear}</span> : null}
					{runtime && runtime !== '0m' ? <span className={css.metaText}>{runtime}</span> : null}
					{status === 'Continuing' ? <span className={`${css.chip} ${css.chipContinuing}`}>{$L('Continuing')}</span> : null}
					{status === 'Ended' ? <span className={`${css.chip} ${css.chipEnded}`}>{$L('Ended')}</span> : null}
					{item.OfficialRating ? <span className={css.chip}>{item.OfficialRating}</span> : null}
					{resolution ? <span className={css.chip}>{resolution}</span> : null}
				</div>

				<div className={css.ratings}>
					{ratingsItem ? (
						<RatingsRow
							item={ratingsItem}
							serverUrl={ratingsItem._serverUrl || serverUrl}
							compact
							pluginEnabled={isMdblistEnabled(settings)}
						/>
					) : null}
				</div>
			</div>
		</div>
	);
};

export default FocusedItemHud;
