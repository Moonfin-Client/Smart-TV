import {useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

import CoreDialog from '../CoreDialog';
import TrackOptionRow from '../TrackOptionRow';
import {getApiForItem} from '../../services/connectionPool';
import {copiesOf, copyKey, withoutCopies} from '../../utils/mergedCopies';
import {formatFileSize} from '../../utils/formatFileSize';

// A server that takes longer than this to describe its copy is listed without the details.
const DETAILS_TIMEOUT_MS = 4000;

const withTimeout = (promise) => new Promise((resolve) => {
	const timer = setTimeout(() => resolve(null), DETAILS_TIMEOUT_MS);
	promise.then((value) => {
		clearTimeout(timer);
		resolve(value || null);
	}, () => {
		clearTimeout(timer);
		resolve(null);
	});
});

const detailsOf = (copy) => {
	const api = getApiForItem(copy);
	if (!api?.getItem) return Promise.resolve(null);
	return withTimeout(api.getItem(copy.Id));
};

// The quality, sound and size of a copy, and how far into it the viewer is.
const describe = (copy, details) => {
	const shown = details || copy;
	const source = Array.isArray(details?.MediaSources) ? details.MediaSources[0] : null;
	const streams = Array.isArray(source?.MediaStreams) ? source.MediaStreams : (details?.MediaStreams || []);
	const titleOf = (type) => streams.find((stream) => stream?.Type === type)?.DisplayTitle || null;
	const parts = [titleOf('Video'), titleOf('Audio'), formatFileSize(source?.Size)].filter(Boolean);
	const userData = shown.UserData || {};
	let status = null;
	if (!details) status = $L('Unavailable');
	else if (userData.Played) status = $L('Watched');
	else if (userData.PlayedPercentage > 0) status = $L('{percent}% watched').replace('{percent}', String(Math.round(userData.PlayedPercentage)));
	return [status, ...parts].filter(Boolean).join(' · ');
};

// Asks which server's copy to open when several servers hold a title. Each server is asked for its copy's details as
// the dialog opens, and one that doesn't answer is still listed.
const MergedCopyPicker = ({item, onPick, onClose}) => {
	const copies = copiesOf(item);
	const [details, setDetails] = useState({});

	useEffect(() => {
		let cancelled = false;
		setDetails({});
		copiesOf(item).forEach((copy, index) => {
			detailsOf(copy).then((value) => {
				if (!cancelled) setDetails((prev) => ({...prev, [index]: value || false}));
			});
		});
		return () => {
			cancelled = true;
		};
	}, [item]);

	const handlePick = useCallback((ev) => {
		const copy = copiesOf(item)[Number(ev.currentTarget.dataset.index)];
		if (copy) onPick(withoutCopies(copy));
	}, [item, onPick]);

	return (
		<CoreDialog
			open={Boolean(item)}
			onClose={onClose}
			title={$L('Select Server')}
			subtitle={item?.Name}
			showCancel
			spotlightId="merged-copy-picker"
		>
			{copies.map((copy, index) => {
				const known = Object.prototype.hasOwnProperty.call(details, index);
				return (
					<TrackOptionRow
						key={copyKey(copy)}
						label={copy._serverName || $L('Server')}
						detail={known ? describe(copy, details[index] || null) : $L('Loading...')}
						selected={index === 0}
						data-index={index}
						onClick={handlePick}
						spotlightId={index === 0 ? 'merged-copy-picker-first' : undefined}
					/>
				);
			})}
		</CoreDialog>
	);
};

export default MergedCopyPicker;
