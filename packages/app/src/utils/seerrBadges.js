// Seerr tracks a title's availability twice, once for HD and once for 4K, and each can also
// be declined on its own. The badge on the detail screen has to say something sensible about
// every pairing of those, which is what most of this file is.

import $L from '@enact/i18n/$L';

import {MEDIA_STATUS, REQUEST_STATUS} from './seerrStatus';
import {uiLocale} from './uiLocale';

export const getSeasonStatusLabel = (status) => {
	switch (status) {
		case REQUEST_STATUS.PENDING: return $L('Pending');
		case REQUEST_STATUS.APPROVED: return $L('Processing');
		case REQUEST_STATUS.DECLINED: return $L('Declined');
		case REQUEST_STATUS.FAILED: return $L('Failed');
		case REQUEST_STATUS.COMPLETED: return $L('Available');
		default: return null;
	}
};

export const getSeasonStatusColor = (status) => {
	switch (status) {
		case REQUEST_STATUS.PENDING: return 'yellow';
		case REQUEST_STATUS.APPROVED: return 'indigo';
		case REQUEST_STATUS.DECLINED: return 'red';
		case REQUEST_STATUS.FAILED: return 'red';
		case REQUEST_STATUS.COMPLETED: return 'green';
		default: return 'gray';
	}
};

export const isSeasonRerequestable = (status) =>
	status === REQUEST_STATUS.DECLINED || status === REQUEST_STATUS.FAILED;

// The season maps say where a request stands, while the marker on a card speaks in media
// status. Declined and failed get no marker, since a season nobody is getting looks the same
// as one nobody asked for.
export const seasonMarkerStatus = (requestStatus) => {
	switch (requestStatus) {
		case REQUEST_STATUS.PENDING: return MEDIA_STATUS.PENDING;
		case REQUEST_STATUS.APPROVED: return MEDIA_STATUS.PROCESSING;
		case REQUEST_STATUS.COMPLETED: return MEDIA_STATUS.AVAILABLE;
		default: return null;
	}
};

const trackPill = (status, declined) => {
	if (declined) return {label: $L('Declined'), color: 'red'};
	switch (status) {
		case MEDIA_STATUS.AVAILABLE: return {label: $L('Available'), color: 'green'};
		case MEDIA_STATUS.PARTIALLY_AVAILABLE: return {label: $L('Partially Available'), color: 'green'};
		case MEDIA_STATUS.PROCESSING: return {label: $L('Requested'), color: 'purple'};
		case MEDIA_STATUS.PENDING: return {label: $L('Pending'), color: 'yellow'};
		case MEDIA_STATUS.BLOCKLISTED: return {label: $L('Blocklisted'), color: 'red'};
		case MEDIA_STATUS.DELETED: return {label: $L('Deleted'), color: 'red'};
		default: return {label: $L('Not Requested'), color: 'gray'};
	}
};

// The word a poster's banner shows for a media status.
export const mediaStatusLabel = (status) => trackPill(status, false).label;

const hasAnyState = (status, declined) => declined || (status != null && status > MEDIA_STATUS.UNKNOWN);

// One pill per quality track rather than one combined badge. HD alone stays
// unlabeled, but once the 4K track has anything to say both carry their name so
// they read as "HD · Available" and "4K · Requested". On a title already in the
// library, plain HD availability repeats what the screen it sits on already
// says, so that pill stays silent, while 4K always speaks when it has state,
// because owning the HD copy says nothing about the 4K one.
export const getStatusPills = (hdStatus, status4k, hdDeclined, fourKDeclined) => {
	const tracks = hasAnyState(status4k, fourKDeclined)
		? [
			{status: hdStatus, declined: hdDeclined, prefix: 'HD'},
			{status: status4k, declined: fourKDeclined, prefix: '4K'}
		]
		: [{status: hdStatus, declined: hdDeclined, prefix: null}];
	return tracks
		.filter((t) => t.prefix === '4K' ||
			(t.status !== MEDIA_STATUS.AVAILABLE && hasAnyState(t.status, t.declined)))
		.map((t) => {
			const {label, color} = trackPill(t.status, t.declined);
			return {text: t.prefix ? `${t.prefix} · ${label}` : label, color};
		});
};

export const formatDate = (dateStr) => {
	if (!dateStr) return null;
	try {
		const date = new Date(dateStr);
		return date.toLocaleDateString(uiLocale(), {year: 'numeric', month: 'long', day: 'numeric'});
	} catch {
		return null;
	}
};

// Seerr reports budget and revenue in US dollars whatever the viewer's locale, so only the
// grouping and symbol placement follow the locale.
export const formatCurrency = (amount) => {
	if (!amount || amount <= 0) return null;
	try {
		return new Intl.NumberFormat(uiLocale(), {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	} catch {
		return `$${Math.round(amount).toLocaleString(uiLocale())}.00`;
	}
};

// Takes minutes, which is what the Seerr API reports.
export const formatRuntime = (minutes) => {
	if (!minutes) return null;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (hours === 0) return `${mins}m`;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};
