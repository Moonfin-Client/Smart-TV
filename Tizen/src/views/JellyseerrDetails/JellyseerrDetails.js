import {useCallback, useEffect, useState, useRef, useMemo, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import Image from '@enact/sandstone/Image';
import Popup from '@enact/sandstone/Popup';
import Button from '@enact/sandstone/Button';
import jellyseerrApi, {canRequestMovies, canRequestTv, canRequest4kMovies, canRequest4kTv, hasAdvancedRequestPermission} from '../../services/jellyseerrApi';
import {useJellyseerr} from '../../context/JellyseerrContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import {isBackKey} from '../../utils/tizenKeys';
import css from './JellyseerrDetails.module.less';

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');
const ActionButtonsContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');
const CastSectionContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');
const KeywordsSectionContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	restrict: 'self-only'
}, 'div');

// Safe wrapper around Spotlight.focus to prevent crashes when DOM elements aren't ready
const safeFocus = (spotlightId) => {
	try {
		return Spotlight.focus(spotlightId);
	} catch (e) {
		console.warn('Spotlight.focus failed for:', spotlightId, e.message);
		return false;
	}
};

const STATUS = {
	UNKNOWN: 1,
	PENDING: 2,
	PROCESSING: 3,
	PARTIALLY_AVAILABLE: 4,
	AVAILABLE: 5,
	BLACKLISTED: 6
};

const REQUEST_STATUS = {
	PENDING: 1,
	APPROVED: 2,
	DECLINED: 3,
	AVAILABLE: 4
};

const getSeasonStatusLabel = (status) => {
	switch (status) {
		case REQUEST_STATUS.PENDING: return 'Pending';
		case REQUEST_STATUS.APPROVED: return 'Processing';
		case REQUEST_STATUS.DECLINED: return 'Declined';
		case REQUEST_STATUS.AVAILABLE: return 'Available';
		default: return null;
	}
};

const getSeasonStatusColor = (status) => {
	switch (status) {
		case REQUEST_STATUS.PENDING: return 'yellow';
		case REQUEST_STATUS.APPROVED: return 'indigo';
		case REQUEST_STATUS.DECLINED: return 'red';
		case REQUEST_STATUS.AVAILABLE: return 'green';
		default: return 'gray';
	}
};

const getStatusBadge = (hdStatus, status4k, hdDeclined, fourKDeclined) => {
	if (hdDeclined && fourKDeclined) return {text: 'DECLINED', color: 'red'};
	if (fourKDeclined && hdStatus === STATUS.AVAILABLE) return {text: 'HD AVAILABLE • 4K DECLINED', color: 'mixed'};
	if (hdDeclined && status4k === STATUS.AVAILABLE) return {text: 'HD DECLINED • 4K AVAILABLE', color: 'mixed'};
	if (fourKDeclined) return {text: '4K DECLINED', color: 'red'};
	if (hdDeclined) return {text: 'HD DECLINED', color: 'red'};

	if (hdStatus === STATUS.AVAILABLE && status4k === STATUS.AVAILABLE) return {text: 'HD + 4K AVAILABLE', color: 'green'};

	if (status4k === STATUS.AVAILABLE) return {text: '4K AVAILABLE', color: 'green'};
	if (hdStatus === STATUS.AVAILABLE) return {text: 'HD AVAILABLE', color: 'green'};

	if (hdStatus === STATUS.PARTIALLY_AVAILABLE && status4k === STATUS.PARTIALLY_AVAILABLE) return {text: 'PARTIALLY AVAILABLE', color: 'purple'};
	if (hdStatus === STATUS.PARTIALLY_AVAILABLE && status4k === STATUS.PROCESSING) return {text: 'HD PARTIAL • 4K PROCESSING', color: 'mixed'};
	if (hdStatus === STATUS.PARTIALLY_AVAILABLE && status4k === STATUS.PENDING) return {text: 'HD PARTIAL • 4K PENDING', color: 'mixed'};
	if (hdStatus === STATUS.PARTIALLY_AVAILABLE) return {text: 'HD PARTIALLY AVAILABLE', color: 'purple'};
	if (status4k === STATUS.PARTIALLY_AVAILABLE && hdStatus === STATUS.PROCESSING) return {text: 'HD PROCESSING • 4K PARTIAL', color: 'mixed'};
	if (status4k === STATUS.PARTIALLY_AVAILABLE && hdStatus === STATUS.PENDING) return {text: 'HD PENDING • 4K PARTIAL', color: 'mixed'};
	if (status4k === STATUS.PARTIALLY_AVAILABLE) return {text: '4K PARTIALLY AVAILABLE', color: 'purple'};

	if (hdStatus === STATUS.PROCESSING && status4k === STATUS.PROCESSING) return {text: 'PROCESSING', color: 'indigo'};
	if (hdStatus === STATUS.PROCESSING && status4k === STATUS.PENDING) return {text: 'HD PROCESSING • 4K PENDING', color: 'mixed'};
	if (status4k === STATUS.PROCESSING && hdStatus === STATUS.PENDING) return {text: 'HD PENDING • 4K PROCESSING', color: 'mixed'};
	if (status4k === STATUS.PROCESSING) return {text: '4K PROCESSING', color: 'indigo'};
	if (hdStatus === STATUS.PROCESSING) return {text: 'HD PROCESSING', color: 'indigo'};

	if (hdStatus === STATUS.PENDING && status4k === STATUS.PENDING) return {text: 'PENDING', color: 'yellow'};
	if (status4k === STATUS.PENDING) return {text: '4K PENDING', color: 'yellow'};
	if (hdStatus === STATUS.PENDING) return {text: 'HD PENDING', color: 'yellow'};

	if (hdStatus === STATUS.BLACKLISTED || status4k === STATUS.BLACKLISTED) return {text: 'BLACKLISTED', color: 'red'};

	return {text: 'NOT REQUESTED', color: 'gray'};
};

const isStatusBlocked = (currentStatus) => {
	return currentStatus != null && currentStatus >= 2 && currentStatus !== STATUS.PARTIALLY_AVAILABLE;
};

const formatDate = (dateStr) => {
	if (!dateStr) return null;
	try {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'});
	} catch {
		return null;
	}
};

const formatCurrency = (amount) => {
	if (!amount || amount <= 0) return null;
	return new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0}).format(amount);
};

const formatRuntime = (minutes) => {
	if (!minutes) return null;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

const CastCard = memo(({person, onSelect}) => {
	const photoUrl = person.profilePath
		? jellyseerrApi.getImageUrl(person.profilePath, 'w185')
		: null;

	const handleClick = useCallback(() => {
		onSelect(person);
	}, [person, onSelect]);

	return (
		<SpottableDiv className={css.castCard} onClick={handleClick}>
			<div className={css.castPhotoContainer}>
				{photoUrl ? (
					<Image className={css.castPhoto} src={photoUrl} sizing="fill" />
				) : (
					<div className={css.castPhotoPlaceholder}>{person.name?.[0]}</div>
				)}
			</div>
			<p className={css.castName}>{person.name}</p>
			{person.character && <p className={css.castCharacter}>{person.character}</p>}
		</SpottableDiv>
	);
});

const MediaCard = memo(({item, onSelect}) => {
	const posterUrl = jellyseerrApi.getImageUrl(item.posterPath || item.poster_path, 'w342');
	const title = item.title || item.name;

	const handleClick = useCallback(() => {
		onSelect(item);
	}, [item, onSelect]);

	return (
		<SpottableDiv className={css.recommendationCard} onClick={handleClick}>
			{posterUrl ? (
				<Image className={css.recommendationPoster} src={posterUrl} sizing="fill" />
			) : (
				<div className={css.recommendationNoPoster}>{title?.[0]}</div>
			)}
			<div className={css.recommendationTitle}>{title}</div>
		</SpottableDiv>
	);
});

const KeywordTag = memo(({keyword, onSelect}) => {
	const handleClick = useCallback(() => {
		onSelect(keyword);
	}, [keyword, onSelect]);

	return (
		<SpottableDiv className={css.keywordTag} onClick={handleClick}>
			{keyword.name}
		</SpottableDiv>
	);
});

const HorizontalMediaRow = memo(({title, items, onSelect, rowIndex, onNavigateUp, onNavigateDown, sectionClass}) => {
	const scrollerRef = useRef(null);

	const handleFocus = useCallback((e) => {
		const card = e.target.closest(`.${css.recommendationCard}`);
		const scroller = scrollerRef.current;
		if (card && scroller) {
			const cardRect = card.getBoundingClientRect();
			const scrollerRect = scroller.getBoundingClientRect();

			if (cardRect.left < scrollerRect.left) {
				scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
			} else if (cardRect.right > scrollerRect.right) {
				scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
			}
		}
	}, []);

	const handleKeyDown = useCallback((e) => {
		if (e.keyCode === 38) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateUp?.(rowIndex);
		} else if (e.keyCode === 40) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateDown?.(rowIndex);
		}
	}, [rowIndex, onNavigateUp, onNavigateDown]);

	if (!items || items.length === 0) return null;

	return (
		<div className={sectionClass}>
			<h2 className={css.sectionTitle}>{title}</h2>
			<RowContainer
				className={css.rowContainer}
				spotlightId={`details-row-${rowIndex}`}
				data-row-index={rowIndex}
				onKeyDown={handleKeyDown}
				ref={scrollerRef}
				onFocus={handleFocus}
			>
				{items.map(item => (
					<MediaCard key={item.id} item={item} onSelect={onSelect} />
				))}
			</RowContainer>
		</div>
	);
});

const QualitySelectionPopup = memo(({open, title, hdStatus, status4k, canRequestHd, canRequest4k, onSelect, onClose}) => {
	const getButtonLabel = useCallback((is4k, currentStatus) => {
		const quality = is4k ? '4K' : 'HD';
		if (currentStatus === STATUS.PENDING) return `${quality} (Pending)`;
		if (currentStatus === STATUS.PROCESSING) return `${quality} (Processing)`;
		if (currentStatus === STATUS.AVAILABLE) return `${quality} (Available)`;
		if (currentStatus === STATUS.PARTIALLY_AVAILABLE) return `Request More ${quality}`;
		return `Request ${quality}`;
	}, []);

	const handleHdClick = useCallback(() => {
		if (canRequestHd) onSelect(false);
	}, [canRequestHd, onSelect]);

	const handleFourKClick = useCallback(() => {
		if (canRequest4k) onSelect(true);
	}, [canRequest4k, onSelect]);

	return (
		<Popup open={open} onClose={onClose} position="center" className={css.qualityPopup}>
			<div className={css.qualityPopupContent}>
				<h2 className={css.qualityPopupTitle}>Request {title}</h2>
				<p className={css.qualityPopupSubtitle}>Select quality to request</p>
				<div className={css.qualityButtons}>
					<Button
						className={`${css.qualityButton} ${!canRequestHd ? css.qualityButtonDisabled : ''}`}
						onClick={handleHdClick}
						disabled={!canRequestHd}
					>
						{getButtonLabel(false, hdStatus)}
					</Button>
					<Button
						className={`${css.qualityButton} ${!canRequest4k ? css.qualityButtonDisabled : ''}`}
						onClick={handleFourKClick}
						disabled={!canRequest4k}
					>
						{getButtonLabel(true, status4k)}
					</Button>
				</div>
				<Button className={css.qualityCancelButton} onClick={onClose}>
					Cancel
				</Button>
			</div>
		</Popup>
	);
});

const SeasonSelectionContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const SeasonSelectionPopup = memo(({open, title, seasons, seasonStatusMap, onConfirm, onClose}) => {
	const [selectedSeasons, setSelectedSeasons] = useState(new Set());

	const availableSeasons = useMemo(() =>
		(seasons || []).filter(s => s.seasonNumber > 0),
	[seasons]);

	const isSeasonUnavailable = useCallback((seasonNumber) => {
		const status = seasonStatusMap?.get(seasonNumber);
		return status != null && status !== REQUEST_STATUS.DECLINED;
	}, [seasonStatusMap]);

	useEffect(() => {
		if (open) {
			const initialSelection = new Set(
				availableSeasons
					.filter(s => !isSeasonUnavailable(s.seasonNumber))
					.map(s => s.seasonNumber)
			);
			setSelectedSeasons(initialSelection);
		}
	}, [open, availableSeasons, isSeasonUnavailable]);

	const allSelectableSeasons = useMemo(() =>
		availableSeasons.filter(s => !isSeasonUnavailable(s.seasonNumber)),
	[availableSeasons, isSeasonUnavailable]);

	const allSelected = useMemo(() =>
		allSelectableSeasons.length > 0 &&
		allSelectableSeasons.every(s => selectedSeasons.has(s.seasonNumber)),
	[allSelectableSeasons, selectedSeasons]);

	const handleToggleSeason = useCallback((e) => {
		const seasonNumber = parseInt(e.currentTarget.dataset.season, 10);
		if (isNaN(seasonNumber)) return;
		setSelectedSeasons(prev => {
			const next = new Set(prev);
			if (next.has(seasonNumber)) {
				next.delete(seasonNumber);
			} else {
				next.add(seasonNumber);
			}
			return next;
		});
	}, []);

	const handleToggleAll = useCallback(() => {
		if (allSelected) {
			setSelectedSeasons(new Set());
		} else {
			setSelectedSeasons(new Set(allSelectableSeasons.map(s => s.seasonNumber)));
		}
	}, [allSelected, allSelectableSeasons]);

	const handleConfirm = useCallback(() => {
		if (selectedSeasons.size > 0) {
			onConfirm(Array.from(selectedSeasons).sort((a, b) => a - b));
		}
	}, [selectedSeasons, onConfirm]);

	const canConfirm = selectedSeasons.size > 0;

	return (
		<Popup open={open} onClose={onClose} position="center" className={css.seasonPopup}>
			<div className={css.seasonPopupContent}>
				<h2 className={css.seasonPopupTitle}>Select Seasons</h2>
				<p className={css.seasonPopupSubtitle}>{title}</p>

				<SeasonSelectionContainer className={css.seasonsList} spotlightId="season-selection">
					{/* Select All option */}
					{allSelectableSeasons.length > 1 && (
						<SpottableDiv
							className={`${css.seasonCheckItem} ${allSelected ? css.seasonCheckItemSelected : ''}`}
							onClick={handleToggleAll}
						>
							<div className={`${css.seasonCheckbox} ${allSelected ? css.seasonCheckboxChecked : ''}`}>
								{allSelected && '✓'}
							</div>
							<span className={css.seasonCheckLabel}>Select All</span>
						</SpottableDiv>
					)}

					{/* Individual seasons */}
					{availableSeasons.map(season => {
						const seasonStatus = seasonStatusMap?.get(season.seasonNumber);
						const isUnavailable = isSeasonUnavailable(season.seasonNumber);
						const isSelected = selectedSeasons.has(season.seasonNumber);
						const statusLabel = getSeasonStatusLabel(seasonStatus);
						const statusColor = getSeasonStatusColor(seasonStatus);

						return (
							<SpottableDiv
								key={season.seasonNumber}
								className={`${css.seasonCheckItem} ${isSelected ? css.seasonCheckItemSelected : ''} ${isUnavailable ? css.seasonCheckItemUnavailable : ''}`}
								onClick={!isUnavailable ? handleToggleSeason : undefined}
								data-season={season.seasonNumber}
								disabled={isUnavailable}
							>
								<div className={`${css.seasonCheckbox} ${isSelected ? css.seasonCheckboxChecked : ''} ${isUnavailable ? css.seasonCheckboxDisabled : ''}`}>
									{isSelected && !isUnavailable && '✓'}
									{isUnavailable && '—'}
								</div>
								<div className={css.seasonCheckInfo}>
									<span className={css.seasonCheckLabel}>{season.name || `Season ${season.seasonNumber}`}</span>
									<span className={css.seasonCheckMeta}>
										{season.episodeCount} episode{season.episodeCount !== 1 ? 's' : ''}
									</span>
								</div>
								{statusLabel && (
									<span className={`${css.seasonStatusBadge} ${css[`seasonStatus${statusColor}`]}`}>
										{statusLabel}
									</span>
								)}
							</SpottableDiv>
						);
					})}
				</SeasonSelectionContainer>

				<div className={css.seasonPopupButtons}>
					<Button
						className={`${css.seasonConfirmButton} ${!canConfirm ? css.seasonButtonDisabled : ''}`}
						onClick={handleConfirm}
						disabled={!canConfirm}
					>
						Request {selectedSeasons.size} Season{selectedSeasons.size !== 1 ? 's' : ''}
					</Button>
					<Button className={css.seasonCancelButton} onClick={onClose}>
						Cancel
					</Button>
				</div>
			</div>
		</Popup>
	);
});

const AdvancedOptionsContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const AdvancedOptionsPopup = memo(({open, title, servers, is4k, onConfirm, onClose}) => {
	const [selectedServerId, setSelectedServerId] = useState(null);
	const [serverDetails, setServerDetails] = useState(null);
	const [loadingDetails, setLoadingDetails] = useState(false);
	const [selectedProfileId, setSelectedProfileId] = useState(null);
	const [selectedRootFolder, setSelectedRootFolder] = useState(null);

	const availableServers = useMemo(() =>
		(servers || []).filter(s => s.is4k === is4k),
	[servers, is4k]);

	useEffect(() => {
		if (open && availableServers.length > 0) {
			const defaultServer = availableServers[0];
			setSelectedServerId(defaultServer.id);
		}
	}, [open, availableServers]);

	useEffect(() => {
		if (!selectedServerId || !open) return;

		const loadServerDetails = async () => {
			setLoadingDetails(true);
			try {
				const server = availableServers.find(s => s.id === selectedServerId);
				if (!server) return;

				const details = server.isRadarr !== false
					? await jellyseerrApi.getRadarrServerDetails(selectedServerId)
					: await jellyseerrApi.getSonarrServerDetails(selectedServerId);

				setServerDetails(details);

				if (details.profiles?.length > 0) {
					const defaultProfile = details.profiles.find(p => p.id === details.activeProfileId) || details.profiles[0];
					setSelectedProfileId(defaultProfile?.id);
				}
				if (details.rootFolders?.length > 0) {
					const defaultFolder = details.rootFolders.find(f => f.path === details.activeDirectory) || details.rootFolders[0];
					setSelectedRootFolder(defaultFolder?.path);
				}
			} catch (err) {
				console.error('Failed to load server details:', err);
			} finally {
				setLoadingDetails(false);
			}
		};

		loadServerDetails();
	}, [selectedServerId, open, availableServers]);

	useEffect(() => {
		if (!open) {
			setSelectedServerId(null);
			setServerDetails(null);
			setSelectedProfileId(null);
			setSelectedRootFolder(null);
		}
	}, [open]);

	const handleServerChange = useCallback((e) => {
		setSelectedServerId(parseInt(e.currentTarget.dataset.serverid, 10));
	}, []);

	const handleProfileChange = useCallback((e) => {
		setSelectedProfileId(parseInt(e.currentTarget.dataset.profileid, 10));
	}, []);

	const handleFolderChange = useCallback((e) => {
		setSelectedRootFolder(e.currentTarget.dataset.folderpath);
	}, []);

	const handleConfirm = useCallback(() => {
		onConfirm({
			serverId: selectedServerId,
			profileId: selectedProfileId,
			rootFolder: selectedRootFolder
		});
	}, [selectedServerId, selectedProfileId, selectedRootFolder, onConfirm]);

	const handleSkip = useCallback(() => {
		onConfirm(null);
	}, [onConfirm]);

	const canConfirm = selectedServerId != null;

	return (
		<Popup open={open} onClose={onClose} position="center" className={css.advancedPopup}>
			<div className={css.advancedPopupContent}>
				<h2 className={css.advancedPopupTitle}>Request Options</h2>
				<p className={css.advancedPopupSubtitle}>{title} ({is4k ? '4K' : 'HD'})</p>

				{loadingDetails ? (
					<div className={css.advancedLoading}>Loading server options...</div>
				) : (
					<AdvancedOptionsContainer className={css.advancedOptionsList} spotlightId="advanced-options">
						{/* Server Selection (if multiple) */}
						{availableServers.length > 1 && (
							<div className={css.advancedOptionGroup}>
								<label className={css.advancedOptionLabel}>Server</label>
								<div className={css.advancedOptionButtons}>
									{availableServers.map(server => (
										<SpottableDiv
											key={server.id}
											className={`${css.advancedOptionBtn} ${selectedServerId === server.id ? css.advancedOptionBtnSelected : ''}`}
											onClick={handleServerChange}
											data-serverid={server.id}
										>
											{server.name}
										</SpottableDiv>
									))}
								</div>
							</div>
						)}

						{/* Quality Profile Selection */}
						{serverDetails?.profiles?.length > 0 && (
							<div className={css.advancedOptionGroup}>
								<label className={css.advancedOptionLabel}>Quality Profile</label>
								<div className={css.advancedOptionButtons}>
									{serverDetails.profiles.map(profile => (
										<SpottableDiv
											key={profile.id}
											className={`${css.advancedOptionBtn} ${selectedProfileId === profile.id ? css.advancedOptionBtnSelected : ''}`}
											onClick={handleProfileChange}
											data-profileid={profile.id}
										>
											{profile.name}
										</SpottableDiv>
									))}
								</div>
							</div>
						)}

						{/* Root Folder Selection */}
						{serverDetails?.rootFolders?.length > 0 && (
							<div className={css.advancedOptionGroup}>
								<label className={css.advancedOptionLabel}>Download Location</label>
								<div className={css.advancedOptionButtons}>
									{serverDetails.rootFolders.map(folder => (
										<SpottableDiv
											key={folder.id}
											className={`${css.advancedOptionBtn} ${selectedRootFolder === folder.path ? css.advancedOptionBtnSelected : ''}`}
											onClick={handleFolderChange}
											data-folderpath={folder.path}
										>
											{folder.path}
										</SpottableDiv>
									))}
								</div>
							</div>
						)}
					</AdvancedOptionsContainer>
				)}

				<div className={css.advancedPopupButtons}>
					<Button
						className={`${css.advancedConfirmButton} ${!canConfirm ? css.advancedButtonDisabled : ''}`}
						onClick={handleConfirm}
						disabled={!canConfirm || loadingDetails}
					>
						Continue with Options
					</Button>
					<Button className={css.advancedSkipButton} onClick={handleSkip}>
						Use Defaults
					</Button>
					<Button className={css.advancedCancelButton} onClick={onClose}>
						Cancel
					</Button>
				</div>
			</div>
		</Popup>
	);
});

const CancelRequestPopup = memo(({open, pendingRequests, title, onConfirm, onClose}) => {
	const description = useMemo(() => {
		if (!pendingRequests || pendingRequests.length === 0) return '';
		if (pendingRequests.length === 1) {
			const req = pendingRequests[0];
			const quality = req.is4k ? '4K' : 'HD';
			return `Cancel ${quality} request for "${title}"?`;
		}
		const hdCount = pendingRequests.filter(r => !r.is4k).length;
		const fourKCount = pendingRequests.filter(r => r.is4k).length;
		const parts = [];
		if (hdCount > 0) parts.push(`${hdCount} HD`);
		if (fourKCount > 0) parts.push(`${fourKCount} 4K`);
		return `Cancel ${parts.join(' and ')} request${pendingRequests.length > 1 ? 's' : ''} for "${title}"?`;
	}, [pendingRequests, title]);

	return (
		<Popup open={open} onClose={onClose} position="center" className={css.cancelPopup}>
			<div className={css.cancelPopupContent}>
				<h2 className={css.cancelPopupTitle}>Cancel Request</h2>
				<p className={css.cancelPopupDescription}>{description}</p>
				<div className={css.cancelButtons}>
					<Button className={css.cancelConfirmButton} onClick={onConfirm}>
						Cancel Request
					</Button>
					<Button className={css.cancelKeepButton} onClick={onClose}>
						Keep Request
					</Button>
				</div>
			</div>
		</Popup>
	);
});

const JellyseerrDetails = ({mediaType, mediaId, onClose, onSelectItem, onSelectPerson, onSelectKeyword, onBack}) => {
	const {isAuthenticated, user: contextUser} = useJellyseerr();
	const [details, setDetails] = useState(null);
	const [loading, setLoading] = useState(true);
	const [requesting, setRequesting] = useState(false);
	const [error, setError] = useState(null);
	const [recommendations, setRecommendations] = useState([]);
	const [similar, setSimilar] = useState([]);
	const [showQualityPopup, setShowQualityPopup] = useState(false);
	const [showSeasonPopup, setShowSeasonPopup] = useState(false);
	const [showAdvancedPopup, setShowAdvancedPopup] = useState(false);
	const [pendingIs4k, setPendingIs4k] = useState(false);
	const [pendingSeasons, setPendingSeasons] = useState(null);
	const [showCancelPopup, setShowCancelPopup] = useState(false);
	const [userPermissions, setUserPermissions] = useState(null);
	const [has4kServer, setHas4kServer] = useState(false);
	const [hasHdServer, setHasHdServer] = useState(false);
	const [servers, setServers] = useState([]);
	const contentRef = useRef(null);

	const handleCloseQualityPopup = useCallback(() => setShowQualityPopup(false), []);
	const handleCloseSeasonPopup = useCallback(() => setShowSeasonPopup(false), []);
	const handleCloseAdvancedPopup = useCallback(() => setShowAdvancedPopup(false), []);
	const handleCloseCancelPopup = useCallback(() => setShowCancelPopup(false), []);

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (isBackKey(e)) {
				if (showAdvancedPopup) {
					setShowAdvancedPopup(false);
				} else if (showSeasonPopup) {
					setShowSeasonPopup(false);
				} else if (showQualityPopup) {
					setShowQualityPopup(false);
				} else if (showCancelPopup) {
					setShowCancelPopup(false);
				} else {
					onClose?.();
					onBack?.();
				}
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [onClose, onBack, showQualityPopup, showSeasonPopup, showAdvancedPopup, showCancelPopup]);

	useEffect(() => {
		if (!mediaId || !mediaType) return;

		const loadDetails = async () => {
			setLoading(true);
			setError(null);
			try {
				const [data, userData, serversData] = await Promise.all([
					mediaType === 'movie'
						? jellyseerrApi.getMovie(mediaId)
						: jellyseerrApi.getTv(mediaId),
					jellyseerrApi.getUser().catch(() => null),
					(mediaType === 'movie'
						? jellyseerrApi.getRadarrServers()
						: jellyseerrApi.getSonarrServers()
					).catch(() => [])
				]);

				setDetails(data);

				// Use context user permissions (Moonfin) or API user permissions
				if (contextUser?.permissions != null) {
					setUserPermissions(contextUser.permissions);
				} else if (userData?.permissions != null) {
					setUserPermissions(userData.permissions);
				}

				const serversList = Array.isArray(serversData) ? serversData : [];
				const serversWithType = serversList.map(s => ({
					...s,
					isRadarr: mediaType === 'movie'
				}));
				setServers(serversWithType);
				setHas4kServer(serversList.some(s => s.is4k));
				setHasHdServer(serversList.some(s => !s.is4k));

				const loadMultiplePages = async (fetcher) => {
					const allResults = [];
					for (let page = 1; page <= 3; page++) {
						try {
							const pageData = await fetcher(mediaId, page);
							if (pageData?.results) allResults.push(...pageData.results);
						} catch {
							break;
						}
					}
					return allResults;
				};

				const [recsData, similarData] = await Promise.all([
					loadMultiplePages(mediaType === 'movie'
						? jellyseerrApi.getMovieRecommendations
						: jellyseerrApi.getTvRecommendations
					),
					loadMultiplePages(mediaType === 'movie'
						? jellyseerrApi.getMovieSimilar
						: jellyseerrApi.getTvSimilar
					)
				]);
				setRecommendations(recsData.slice(0, 20));
				setSimilar(similarData.slice(0, 20));
			} catch (err) {
				console.error('Failed to load details:', err);
				setError(err.message || 'Failed to load details');
			} finally {
				setLoading(false);
			}
		};

		loadDetails();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mediaId, mediaType]);

	useEffect(() => {
		if (!loading && details) {
			window.requestAnimationFrame(() => {
				safeFocus('action-buttons');
			});
		}
	}, [loading, details]);

	const hdStatus = useMemo(() => details?.mediaInfo?.status ?? null, [details]);
	const status4k = useMemo(() => details?.mediaInfo?.status4k ?? null, [details]);
	const requests = useMemo(() => details?.mediaInfo?.requests ?? [], [details]);
	const hdDeclined = useMemo(() => requests.some(r => !r.is4k && r.status === 3), [requests]);
	const fourKDeclined = useMemo(() => requests.some(r => r.is4k && r.status === 3), [requests]);
	const pendingRequests = useMemo(() => requests.filter(r => r.status === STATUS.PENDING), [requests]);

	const getSeasonStatusMap = useCallback((is4k) => {
		const statusMap = new Map();
		if (!requests || requests.length === 0) return statusMap;

		requests.forEach(req => {
			if (req.is4k === is4k) {
				req.seasons?.forEach(seasonReq => {
					const existingStatus = statusMap.get(seasonReq.seasonNumber);
					const newStatus = seasonReq.status;
					if (!existingStatus ||
						(existingStatus === REQUEST_STATUS.DECLINED && newStatus !== REQUEST_STATUS.DECLINED) ||
						(newStatus === REQUEST_STATUS.AVAILABLE) ||
						(newStatus === REQUEST_STATUS.APPROVED && existingStatus === REQUEST_STATUS.PENDING)) {
						statusMap.set(seasonReq.seasonNumber, newStatus);
					}
				});
			}
		});
		return statusMap;
	}, [requests]);

	const seasonStatusMapHd = useMemo(() => getSeasonStatusMap(false), [getSeasonStatusMap]);
	const seasonStatusMap4k = useMemo(() => getSeasonStatusMap(true), [getSeasonStatusMap]);

	const isBlacklisted = useMemo(() =>
		hdStatus === STATUS.BLACKLISTED || status4k === STATUS.BLACKLISTED,
	[hdStatus, status4k]);

	const canRequestHd = useMemo(() => {
		if (!isAuthenticated || isBlacklisted) return false;
		const blocked = isStatusBlocked(hdStatus) || hdDeclined;
		if (blocked) return false;
		const userCanHd = mediaType === 'movie'
			? canRequestMovies(userPermissions)
			: canRequestTv(userPermissions);
		return userCanHd && hasHdServer;
	}, [isAuthenticated, isBlacklisted, hdStatus, hdDeclined, userPermissions, hasHdServer, mediaType]);

	const canRequest4k = useMemo(() => {
		if (!isAuthenticated || isBlacklisted) return false;
		const blocked = isStatusBlocked(status4k) || fourKDeclined;
		if (blocked) return false;
		const userCan4k = mediaType === 'movie'
			? canRequest4kMovies(userPermissions)
			: canRequest4kTv(userPermissions);
		return userCan4k && has4kServer;
	}, [isAuthenticated, isBlacklisted, status4k, fourKDeclined, userPermissions, has4kServer, mediaType]);

	const canRequestAny = canRequestHd || canRequest4k;

	const hasAdvanced = useMemo(() =>
		hasAdvancedRequestPermission(userPermissions),
	[userPermissions]);

	const statusBadge = useMemo(() =>
		getStatusBadge(hdStatus, status4k, hdDeclined, fourKDeclined),
	[hdStatus, status4k, hdDeclined, fourKDeclined]
	);

	const requestButtonLabel = useMemo(() => {
		if (!canRequestAny) {
			if (hdDeclined && fourKDeclined) return 'Declined';
			if (fourKDeclined) return '4K Declined';
			if (hdDeclined) return 'HD Declined';
			if (hdStatus === STATUS.AVAILABLE && status4k === STATUS.AVAILABLE) return 'Available';
			if (status4k === STATUS.AVAILABLE) return '4K Available';
			if (hdStatus === STATUS.AVAILABLE) return 'HD Available';
			if (hdStatus === STATUS.PROCESSING && status4k === STATUS.PROCESSING) return 'Processing';
			if (status4k === STATUS.PROCESSING) return '4K Processing';
			if (hdStatus === STATUS.PROCESSING) return 'HD Processing';
			if (hdStatus === STATUS.PENDING && status4k === STATUS.PENDING) return 'Pending';
			if (status4k === STATUS.PENDING) return '4K Pending';
			if (hdStatus === STATUS.PENDING) return 'HD Pending';
			if (hdStatus === STATUS.BLACKLISTED || status4k === STATUS.BLACKLISTED) return 'Blacklisted';
			return 'Unavailable';
		}
		if (hdStatus === STATUS.PARTIALLY_AVAILABLE || status4k === STATUS.PARTIALLY_AVAILABLE) return 'Request More';
		return 'Request';
	}, [canRequestAny, hdStatus, status4k, hdDeclined, fourKDeclined]);

	const handleRequest = useCallback(async (is4K = false, seasons = null, advancedOptions = null) => {
		if (requesting) return;

		setShowQualityPopup(false);
		setShowSeasonPopup(false);
		setShowAdvancedPopup(false);
		setRequesting(true);
		try {
			const options = {
				is4k: is4K,
				...(advancedOptions || {})
			};

			if (mediaType === 'movie') {
				await jellyseerrApi.requestMovie(mediaId, options);
			} else {
				await jellyseerrApi.requestTv(mediaId, {
					...options,
					seasons: seasons || 'all'
				});
			}
			const updated = mediaType === 'movie'
				? await jellyseerrApi.getMovie(mediaId)
				: await jellyseerrApi.getTv(mediaId);
			setDetails(updated);
		} catch (err) {
			console.error('Request failed:', err);
			setError(err.message || 'Request failed');
		} finally {
			setRequesting(false);
		}
	}, [mediaId, mediaType, requesting]);

	const proceedWithRequest = useCallback((is4K, seasons = null) => {
		if (hasAdvanced) {
			setPendingIs4k(is4K);
			setPendingSeasons(seasons);
			setShowAdvancedPopup(true);
		} else {
			handleRequest(is4K, seasons);
		}
	}, [hasAdvanced, handleRequest]);

	const handleQualitySelect = useCallback((is4K) => {
		setShowQualityPopup(false);
		if (mediaType === 'tv' && details?.seasons?.length > 0) {
			setPendingIs4k(is4K);
			setShowSeasonPopup(true);
		} else {
			proceedWithRequest(is4K);
		}
	}, [mediaType, details?.seasons, proceedWithRequest]);

	const handleSeasonConfirm = useCallback((selectedSeasons) => {
		proceedWithRequest(pendingIs4k, selectedSeasons);
	}, [pendingIs4k, proceedWithRequest]);

	const handleAdvancedConfirm = useCallback((advancedOptions) => {
		handleRequest(pendingIs4k, pendingSeasons, advancedOptions);
	}, [pendingIs4k, pendingSeasons, handleRequest]);

	const handleRequestClick = useCallback(() => {
		if (!canRequestAny) return;

		if (!hasHdServer && !has4kServer) {
			const mediaTypeName = mediaType === 'movie' ? 'movies' : 'TV shows';
			setError(`No Radarr/Sonarr server configured for ${mediaTypeName} in Jellyseerr`);
			return;
		}

		if (canRequestHd && canRequest4k) {
			setShowQualityPopup(true);
		} else if (canRequest4k) {
			if (mediaType === 'tv' && details?.seasons?.length > 0) {
				setPendingIs4k(true);
				setShowSeasonPopup(true);
			} else {
				proceedWithRequest(true);
			}
		} else if (canRequestHd) {
			if (mediaType === 'tv' && details?.seasons?.length > 0) {
				setPendingIs4k(false);
				setShowSeasonPopup(true);
			} else {
				proceedWithRequest(false);
			}
		}
	}, [canRequestAny, canRequestHd, canRequest4k, proceedWithRequest, hasHdServer, has4kServer, mediaType, details?.seasons]);

	const handleCancelRequestClick = useCallback(() => {
		if (pendingRequests.length > 0) {
			setShowCancelPopup(true);
		}
	}, [pendingRequests]);

	const handleCancelConfirm = useCallback(async () => {
		setShowCancelPopup(false);
		try {
			for (const req of pendingRequests) {
				await jellyseerrApi.cancelRequest(req.id);
			}
			const updated = mediaType === 'movie'
				? await jellyseerrApi.getMovie(mediaId)
				: await jellyseerrApi.getTv(mediaId);
			setDetails(updated);
		} catch (err) {
			console.error('Cancel failed:', err);
			setError(err.message || 'Failed to cancel request');
		}
	}, [pendingRequests, mediaId, mediaType]);

	const handleTrailer = useCallback(() => {
		const mediaTitle = details?.title || details?.name || 'Unknown';
		const mediaYear = details?.releaseDate?.substring(0, 4) || details?.firstAirDate?.substring(0, 4) || '';
		const searchQuery = `${mediaTitle} ${mediaYear} official trailer`;
		const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
		window.open(youtubeUrl, '_blank');
	}, [details]);

	const handlePlay = useCallback(() => {
		if (details?.mediaInfo?.jellyfinMediaId) {
			console.log('Play content:', details.mediaInfo.jellyfinMediaId);
		}
	}, [details]);

	const handleSelectRelated = useCallback((item) => {
		const type = item.mediaType || item.media_type || (item.title ? 'movie' : 'tv');
		onSelectItem?.({mediaId: item.id, mediaType: type});
	}, [onSelectItem]);

	const handleSelectCast = useCallback((person) => {
		onSelectPerson?.(person.id, person.name);
	}, [onSelectPerson]);

	const handleSelectKeyword = useCallback((keyword) => {
		onSelectKeyword?.(keyword, mediaType);
	}, [onSelectKeyword, mediaType]);

	const handleActionButtonsKeyDown = useCallback((e) => {
		if (e.keyCode === 40) {
			e.preventDefault();
			e.stopPropagation();
			const castFocused = safeFocus('cast-section');
			if (!castFocused) {
				const recFocused = safeFocus('details-row-0');
				if (!recFocused) {
					safeFocus('details-row-1');
				}
			}
		}
	}, []);

	const handleRowNavigateUp = useCallback((fromRowIndex) => {
		if (fromRowIndex === 0) {
			const castFocused = safeFocus('cast-section');
			if (!castFocused) {
				safeFocus('action-buttons');
			}
		} else {
			const targetIndex = fromRowIndex - 1;
			const focused = safeFocus(`details-row-${targetIndex}`);
			if (!focused) {
				const castFocused = safeFocus('cast-section');
				if (!castFocused) {
					safeFocus('action-buttons');
				}
			}
		}
	}, []);

	const handleRowNavigateDown = useCallback((fromRowIndex) => {
		const targetIndex = fromRowIndex + 1;
		const focused = safeFocus(`details-row-${targetIndex}`);
		if (!focused) {
			const keywordsFocused = safeFocus('keywords-section');
			if (!keywordsFocused) {
				safeFocus('seasons-section');
			}
		}
	}, []);

	const handleCastSectionKeyDown = useCallback((e) => {
		if (e.keyCode === 38) {
			e.preventDefault();
			e.stopPropagation();
			safeFocus('action-buttons');
		} else if (e.keyCode === 40) {
			e.preventDefault();
			e.stopPropagation();
			const recFocused = safeFocus('details-row-0');
			if (!recFocused) {
				const simFocused = safeFocus('details-row-1');
				if (!simFocused) {
					safeFocus('keywords-section');
				}
			}
		}
	}, []);

	const handleKeywordsSectionKeyDown = useCallback((e) => {
		if (e.keyCode === 38) {
			// Up arrow - navigate to previous section
			e.preventDefault();
			e.stopPropagation();
			const simFocused = safeFocus('details-row-1');
			if (!simFocused) {
				const recFocused = safeFocus('details-row-0');
				if (!recFocused) {
					const castFocused = safeFocus('cast-section');
					if (!castFocused) {
						safeFocus('action-buttons');
					}
				}
			}
		}
	}, []);

	const mediaFacts = useMemo(() => {
		if (!details) return [];
		const facts = [];

		// TMDB Score
		const voteAverage = details.voteAverage;
		if (voteAverage && voteAverage > 0) {
			facts.push({label: 'TMDB Score', value: `${Math.round(voteAverage * 10)}%`});
		}

		// Status
		const productionStatus = details.status;
		if (productionStatus) {
			facts.push({label: 'Status', value: productionStatus});
		}

		// TV Show specific fields
		if (mediaType === 'tv') {
			if (details.firstAirDate) {
				const formatted = formatDate(details.firstAirDate);
				if (formatted) facts.push({label: 'First Air Date', value: formatted});
			}
			if (details.lastAirDate) {
				const formatted = formatDate(details.lastAirDate);
				if (formatted) facts.push({label: 'Last Air Date', value: formatted});
			}
			if (details.numberOfSeasons) {
				facts.push({label: 'Seasons', value: details.numberOfSeasons.toString()});
			}
			// Networks
			if (details.networks?.length > 0) {
				facts.push({label: 'Networks', value: details.networks.slice(0, 3).map(n => n.name).join(', ')});
			}
		}

		// Movie specific fields
		if (mediaType === 'movie') {
			if (details.releaseDate) {
				const formatted = formatDate(details.releaseDate);
				if (formatted) facts.push({label: 'Release Date', value: formatted});
			}
			if (details.runtime) {
				facts.push({label: 'Runtime', value: formatRuntime(details.runtime)});
			}
			if (details.budget) {
				const formatted = formatCurrency(details.budget);
				if (formatted) facts.push({label: 'Budget', value: formatted});
			}
			if (details.revenue) {
				const formatted = formatCurrency(details.revenue);
				if (formatted) facts.push({label: 'Revenue', value: formatted});
			}
		}

		return facts;
	}, [details, mediaType]);

	if (loading) {
		return (
			<div className={css.container}>
				<LoadingSpinner />
			</div>
		);
	}

	if (error && !details) {
		return (
			<div className={css.container}>
				<div className={css.error}>
					<p>{error}</p>
					<SpottableDiv className={css.errorButton} onClick={onClose || onBack}>
						Go Back
					</SpottableDiv>
				</div>
			</div>
		);
	}

	if (!details) {
		return (
			<div className={css.container}>
				<div className={css.error}>
					<p>No details available</p>
				</div>
			</div>
		);
	}

	const posterUrl = details.posterPath
		? jellyseerrApi.getImageUrl(details.posterPath, 'w500')
		: null;
	const backdropUrl = details.backdropPath
		? jellyseerrApi.getImageUrl(details.backdropPath, 'original')
		: null;
	const title = details.title || details.name;
	const year = details.releaseDate
		? new Date(details.releaseDate).getFullYear()
		: details.firstAirDate
			? new Date(details.firstAirDate).getFullYear()
			: null;
	const isAvailable = hdStatus === STATUS.AVAILABLE || hdStatus === STATUS.PARTIALLY_AVAILABLE;
	const keywords = details.keywords || [];

	return (
		<div className={css.container}>
			{/* Quality Selection Popup */}
			<QualitySelectionPopup
				open={showQualityPopup}
				title={title}
				hdStatus={hdStatus}
				status4k={status4k}
				canRequestHd={canRequestHd}
				canRequest4k={canRequest4k}
				onSelect={handleQualitySelect}
				onClose={handleCloseQualityPopup}
			/>

			{/* Season Selection Popup (TV only) */}
			{mediaType === 'tv' && (
				<SeasonSelectionPopup
					open={showSeasonPopup}
					title={title}
					seasons={details?.seasons}
					seasonStatusMap={pendingIs4k ? seasonStatusMap4k : seasonStatusMapHd}
					onConfirm={handleSeasonConfirm}
					onClose={handleCloseSeasonPopup}
				/>
			)}

			{/* Advanced Request Options Popup */}
			{hasAdvanced && (
				<AdvancedOptionsPopup
					open={showAdvancedPopup}
					title={title}
					servers={servers}
					is4k={pendingIs4k}
					onConfirm={handleAdvancedConfirm}
					onClose={handleCloseAdvancedPopup}
				/>
			)}

			{/* Cancel Request Popup */}
			<CancelRequestPopup
				open={showCancelPopup}
				pendingRequests={pendingRequests}
				title={title}
				onConfirm={handleCancelConfirm}
				onClose={handleCloseCancelPopup}
			/>

			{/* Backdrop */}
			<div className={css.backdropSection}>
				{backdropUrl && <Image className={css.backdropImage} src={backdropUrl} />}
				<div className={css.backdropOverlay} />
			</div>

			<div className={css.mainContent} ref={contentRef}>
				{/* Header Section with Poster and Title */}
				<div className={css.headerWrapper}>
					{/* Poster */}
					<div className={css.posterContainer}>
						{posterUrl ? (
							<Image className={css.posterImage} src={posterUrl} sizing="fill" />
						) : (
							<div className={css.posterPlaceholder}>{title?.[0]}</div>
						)}
					</div>

					{/* Title Section */}
					<div className={css.titleSection}>
						<h1 className={css.mediaTitle}>
							{title}
							{year && <span className={css.mediaYear}> ({year})</span>}
						</h1>

						{/* Status Badge - Combined HD/4K status */}
						<div className={`${css.statusBadge} ${css[`badge${statusBadge.color}`]}`}>
							{statusBadge.text}
						</div>

						{/* Metadata Row */}
						<div className={css.metadataRow}>
							{details.voteAverage > 0 && (
								<span className={css.metadataItem}>★ {details.voteAverage.toFixed(1)}</span>
							)}
							{details.runtime && (
								<span className={css.metadataItem}>{formatRuntime(details.runtime)}</span>
							)}
							{details.numberOfSeasons && (
								<span className={css.metadataItem}>
									{details.numberOfSeasons} Season{details.numberOfSeasons > 1 ? 's' : ''}
								</span>
							)}
						</div>

						{/* Genres */}
						{details.genres?.length > 0 && (
							<div className={css.genresRow}>
								{details.genres.slice(0, 3).map(g => g.name).join(' • ')}
							</div>
						)}

						{/* Tagline */}
						{details.tagline && (
							<p className={css.tagline}>&ldquo;{details.tagline}&rdquo;</p>
						)}
					</div>
				</div>

				{/* Overview Section - 2 columns like Android TV */}
				<div className={css.overviewSection}>
					{/* Left side - Overview text and action buttons */}
					<div className={css.overviewLeft}>
						<h2 className={css.overviewHeading}>Overview</h2>
						<p className={css.overview}>{details.overview || 'Overview unavailable.'}</p>

						{/* Action Buttons */}
						<ActionButtonsContainer
							className={css.actionButtons}
							spotlightId="action-buttons"
							onKeyDown={handleActionButtonsKeyDown}
						>
							{/* Request Button */}
							<div className={css.btnWrapper}>
								<SpottableDiv
									className={`${css.btnAction} ${!canRequestAny ? css.btnDisabled : ''}`}
									onClick={handleRequestClick}
									disabled={!canRequestAny}
								>
									<span className={css.btnIcon}>📥</span>
								</SpottableDiv>
								<span className={css.btnLabel}>{requestButtonLabel}</span>
							</div>

							{/* Cancel Request Button - show if pending requests exist */}
							{pendingRequests.length > 0 && (
								<div className={css.btnWrapper}>
									<SpottableDiv className={css.btnAction} onClick={handleCancelRequestClick}>
										<span className={css.btnIcon}>🗑️</span>
									</SpottableDiv>
									<span className={css.btnLabel}>Cancel Request</span>
								</div>
							)}

							{/* Watch Trailer Button */}
							<div className={css.btnWrapper}>
								<SpottableDiv className={css.btnAction} onClick={handleTrailer}>
									<span className={css.btnIcon}>
										<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px">
											<path d="M160-120v-720h80v80h80v-80h320v80h80v-80h80v720h-80v-80h-80v80H320v-80h-80v80h-80Zm80-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm400 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80ZM400-200h160v-560H400v560Zm0-560h160-160Z"/>
										</svg>
									</span>
								</SpottableDiv>
								<span className={css.btnLabel}>Watch Trailer</span>
							</div>

							{/* Play in Moonfin Button (if available) */}
							{isAvailable && (
								<div className={css.btnWrapper}>
									<SpottableDiv className={css.btnAction} onClick={handlePlay}>
										<span className={css.btnIcon}>
											<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px">
												<path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/>
											</svg>
										</span>
									</SpottableDiv>
									<span className={css.btnLabel}>Play in Moonfin</span>
								</div>
							)}
						</ActionButtonsContainer>
					</div>

					{/* Right side - Media Facts */}
					{mediaFacts.length > 0 && (
						<div className={css.mediaFacts}>
							{mediaFacts.map((fact, index) => (
								<div
									key={fact.label}
									className={`${css.factRow} ${index === 0 ? css.factRowFirst : ''} ${index === mediaFacts.length - 1 ? css.factRowLast : ''}`}
								>
									<span className={css.factLabel}>{fact.label}</span>
									<span className={css.factValue}>{fact.value}</span>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Cast Section */}
				{details.credits?.cast?.length > 0 && (
					<CastSectionContainer
						className={css.castSection}
						spotlightId="cast-section"
						onKeyDown={handleCastSectionKeyDown}
					>
						<h2 className={css.sectionTitle}>Cast</h2>
						<div className={css.castScroller}>
							<div className={css.castList}>
								{details.credits.cast.slice(0, 10).map(person => (
									<CastCard key={person.id} person={person} onSelect={handleSelectCast} />
								))}
							</div>
						</div>
					</CastSectionContainer>
				)}

				{/* Recommendations Section */}
				{recommendations.length > 0 && (
					<HorizontalMediaRow
						title="Recommendations"
						items={recommendations}
						onSelect={handleSelectRelated}
						rowIndex={0}
						onNavigateUp={handleRowNavigateUp}
						onNavigateDown={handleRowNavigateDown}
						sectionClass={css.recommendationsSection}
					/>
				)}

				{/* Similar Section */}
				{similar.length > 0 && (
					<HorizontalMediaRow
						title={mediaType === 'tv' ? 'Similar Series' : 'Similar Titles'}
						items={similar}
						onSelect={handleSelectRelated}
						rowIndex={1}
						onNavigateUp={handleRowNavigateUp}
						onNavigateDown={handleRowNavigateDown}
						sectionClass={css.similarSection}
					/>
				)}

				{/* Keywords Section */}
				{keywords.length > 0 && (
					<KeywordsSectionContainer
						className={css.keywordsSection}
						spotlightId="keywords-section"
						onKeyDown={handleKeywordsSectionKeyDown}
					>
						<h2 className={css.sectionTitle}>Keywords</h2>
						<div className={css.keywordsList}>
							{keywords.map(keyword => (
								<KeywordTag key={keyword.id} keyword={keyword} onSelect={handleSelectKeyword} />
							))}
						</div>
					</KeywordsSectionContainer>
				)}
			</div>
		</div>
	);
};

export default JellyseerrDetails;
