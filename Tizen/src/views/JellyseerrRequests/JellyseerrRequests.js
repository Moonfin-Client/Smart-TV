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
import {useJellyseerr} from '../../context/JellyseerrContext';
import {isBackKey} from '../../utils/tizenKeys';
import css from './JellyseerrRequests.module.less';

const SpottableRow = Spottable('div');

const STATUS_LABELS = {
	1: 'Pending Approval',
	2: 'Approved',
	3: 'Declined'
};

const MEDIA_STATUS_LABELS = {
	1: 'Unknown',
	2: 'Pending',
	3: 'Processing',
	4: 'Partially Available',
	5: 'Available'
};

// Memoized request item component to avoid arrow functions in JSX props
const RequestItem = memo(function RequestItem({request, index, onSelect, onCancel}) {
	const media = request.media;
	const posterUrl = media?.posterPath
		? jellyseerrApi.getImageUrl(media.posterPath, 'w185')
		: null;

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
					<span
						className={css.status}
						data-status={request.status}
					>
						{STATUS_LABELS[request.status] || 'Unknown'}
					</span>
					{media?.status && (
						<span
							className={css.mediaStatus}
							data-media-status={media.status}
						>
							{MEDIA_STATUS_LABELS[media.status]}
						</span>
					)}
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
	const [requests, setRequests] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [filter, setFilter] = useState('all');

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (isBackKey(e)) {
				onClose?.();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [onClose]);

	const loadRequests = useCallback(async () => {
		if (!isAuthenticated) return;

		setLoading(true);
		setError(null);
		try {
			const data = await jellyseerrApi.getRequests({take: 100});
			setRequests(data.results || []);
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
			onSelectItem({
				mediaType: request.media.mediaType,
				mediaId: request.media.tmdbId
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
				itemSize={ri.scale(120)}
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
