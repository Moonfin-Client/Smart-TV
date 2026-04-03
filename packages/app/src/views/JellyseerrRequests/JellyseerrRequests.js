import {useCallback, useEffect, useState, memo} from 'react';
import {Row, Column} from '@enact/ui/Layout';
import {Panel, Header} from '@enact/sandstone/Panels';
import Spinner from '@enact/sandstone/Spinner';
import BodyText from '@enact/sandstone/BodyText';
import Button from '@enact/sandstone/Button';
import Image from '@enact/sandstone/Image';
import TabLayout, {Tab} from '@enact/sandstone/TabLayout';
import VirtualList from '@enact/sandstone/VirtualList';
import ri from '@enact/ui/resolution';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import jellyseerrApi from '../../services/jellyseerrApi';
import hydrateRequestMediaItems from '../../utils/jellyseerrHydration';
import {useJellyseerr} from '../../context/JellyseerrContext';
import {useSettings} from '../../context/SettingsContext';
import css from './JellyseerrRequests.module.less';

const SpottableRow = Spottable('div');

const getStatusInfo = (request) => {
	const mediaStatus = request.media?.status;
	if (request.status === 1) return {label: 'Pending', variant: css.chipPending};
	if (request.status === 3) return {label: 'Declined', variant: css.chipDeclined};
	if (mediaStatus === 5) return {label: 'Available', variant: css.chipAvailable};
	if (mediaStatus === 4) return {label: 'Partially Available', variant: css.chipPartial};
	if (mediaStatus === 3) return {label: 'Downloading', variant: css.chipDownloading};
	if (request.status === 2) return {label: 'Approved', variant: css.chipApproved};
	return {label: 'Unknown', variant: css.chipPending};
};

// Memoized request item component to avoid arrow functions in JSX props
const RequestItem = memo(function RequestItem({request, index, onSelect, onCancel}) {
	const media = request.media;
	const posterUrl = media?.posterPath
		? jellyseerrApi.getImageUrl(media.posterPath, 'w185')
		: null;
	const {label: statusLabel, variant: statusVariant} = getStatusInfo(request);

	const handleClick = useCallback(() => {
		onSelect(request);
	}, [request, onSelect]);

	const handleCancelClick = useCallback((e) => {
		onCancel(request.id, e);
	}, [request.id, onCancel]);

	return (
		<SpottableRow
			className={css.requestItem}
			data-spotlight-id={`request-${index}`}
			onClick={handleClick}
		>
			{posterUrl && (
				<Image src={posterUrl} className={css.poster} sizing="fill" />
			)}
			<Column className={css.requestInfo}>
				<BodyText className={css.title}>
					{media?.title || media?.name || 'Unknown'}
				</BodyText>
				<Row className={css.meta}>
					<span className={css.type}>
						{media?.mediaType === 'movie' ? 'Movie' : 'TV Show'}
					</span>
					<span className={`${css.statusChip} ${statusVariant}`}>
						{statusLabel}
					</span>
				</Row>
				<BodyText className={css.date}>
					Requested: {new Date(request.createdAt).toLocaleDateString()}
				</BodyText>
			</Column>
			{request.status === 1 && (
				<Button
					className={css.cancelBtn}
					size="small"
					icon="trash"
					onClick={handleCancelClick}
				>
					Cancel
				</Button>
			)}
		</SpottableRow>
	);
});

const JellyseerrRequests = ({onSelectItem, onClose, ...rest}) => {
	const {isAuthenticated} = useJellyseerr();
	const {settings} = useSettings();
	const [requests, setRequests] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [filter, setFilter] = useState('all');

	const loadRequests = useCallback(async () => {
		if (!isAuthenticated) return;

		setLoading(true);
		setError(null);
		try {
			const data = await jellyseerrApi.getRequests({take: 100});
			const hydrated = await hydrateRequestMediaItems(data.results || []);
			setRequests(hydrated);
		} catch (err) {
			console.error('Failed to load requests:', err);
			setError(err.message || 'Failed to load requests');
		} finally {
			setLoading(false);
		}
	}, [isAuthenticated]);

	useEffect(() => {
		loadRequests();
	}, [loadRequests]);

	useEffect(() => {
		if (!loading && requests.length > 0) {
			Spotlight.focus('[data-spotlight-id="request-0"]');
		}
	}, [loading, requests]);

	const handleSelect = useCallback((request) => {
		if (onSelectItem && request.media) {
			const mediaType = request.media.mediaType || request.media.media_type || request.type;
			onSelectItem({
				mediaType,
				mediaId: request.media.tmdbId || request.media.id
			});
		}
	}, [onSelectItem]);

	const handleCancel = useCallback(async (requestId, e) => {
		e.stopPropagation();
		try {
			await jellyseerrApi.cancelRequest(requestId);
			await loadRequests();
		} catch (err) {
			console.error('Failed to cancel request:', err);
		}
	}, [loadRequests]);

	const handleTabSelect = useCallback(({index}) => {
		const filters = ['all', 'pending', 'approved', 'available'];
		setFilter(filters[index]);
	}, []);

	const filteredRequests = requests.filter(r => {
		if (filter === 'all') return true;
		if (filter === 'pending') return r.status === 1;
		if (filter === 'approved') return r.status === 2;
		if (filter === 'available') return r.media?.status === 5;
		return true;
	});

	const renderRequest = useCallback(({index}) => {
		const request = filteredRequests[index];
		if (!request) return null;

		return (
			<RequestItem
				key={request.id}
				request={request}
				index={index}
				onSelect={handleSelect}
				onCancel={handleCancel}
			/>
		);
	}, [filteredRequests, handleSelect, handleCancel]);

	const renderContent = () => {
		if (!isAuthenticated) {
			return (
				<Column align="center center" className={css.message}>
					<BodyText>Please configure Jellyseerr in Settings</BodyText>
				</Column>
			);
		}

		if (loading) {
			return <Spinner centered>Loading requests...</Spinner>;
		}

		if (error) {
			return (
				<Column align="center center" className={css.error}>
					<BodyText>{error}</BodyText>
					<Button onClick={loadRequests}>Retry</Button>
				</Column>
			);
		}

		if (filteredRequests.length === 0) {
			return (
				<Column align="center center" className={css.message}>
					<BodyText>No requests found</BodyText>
				</Column>
			);
		}

		return (
			<VirtualList
				dataSize={filteredRequests.length}
				itemRenderer={renderRequest}
				itemSize={ri.scale(120 * (settings.uiScale || 1.0))}
				direction="vertical"
				spotlightId="requests-list"
			/>
		);
	};

	return (
		<Panel {...rest}>
			<Header
				title="My Requests"
				onClose={onClose}
				type="compact"
			/>
			<TabLayout
				onSelect={handleTabSelect}
			>
				<Tab title="All">
					{renderContent()}
				</Tab>
				<Tab title="Pending">
					{renderContent()}
				</Tab>
				<Tab title="Approved">
					{renderContent()}
				</Tab>
				<Tab title="Available">
					{renderContent()}
				</Tab>
			</TabLayout>
		</Panel>
	);
};

export default JellyseerrRequests;
