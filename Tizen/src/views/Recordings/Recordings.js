import {useState, useEffect, useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {useAuth} from '../../context/AuthContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import {formatDuration} from '../../utils/helpers';
import {isBackKey} from '../../utils/tizenKeys';

import css from './Recordings.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const RecordingCard = ({recording, serverUrl, onSelect}) => {
	const handleClick = useCallback(() => {
		onSelect(recording);
	}, [recording, onSelect]);

	return (
		<SpottableDiv
			className={css.card}
			onClick={handleClick}
		>
			{recording.ImageTags?.Primary ? (
				<img
					className={css.cardImage}
					src={`${serverUrl}/Items/${recording.Id}/Images/Primary?maxWidth=300&quality=90`}
					alt=""
				/>
			) : (
				<div className={css.cardPlaceholder}>
					<span>📺</span>
				</div>
			)}
			<div className={css.cardInfo}>
				<div className={css.cardTitle}>{recording.Name}</div>
				{recording.EpisodeTitle && (
					<div className={css.cardSubtitle}>{recording.EpisodeTitle}</div>
				)}
				<div className={css.cardMeta}>
					{recording.ChannelName}
					{recording.RunTimeTicks && (
						<span> • {formatDuration(recording.RunTimeTicks)}</span>
					)}
				</div>
			</div>
		</SpottableDiv>
	);
};

const TimerCard = ({timer, serverUrl, formatScheduledTime, onSelect}) => {
	const handleClick = useCallback(() => {
		onSelect(timer);
	}, [timer, onSelect]);

	return (
		<SpottableDiv
			className={css.card}
			onClick={handleClick}
		>
			{timer.ProgramInfo?.ImageTags?.Primary ? (
				<img
					className={css.cardImage}
					src={`${serverUrl}/Items/${timer.ProgramInfo.Id}/Images/Primary?maxWidth=300&quality=90`}
					alt=""
				/>
			) : (
				<div className={css.cardPlaceholder}>
					<span>⏰</span>
				</div>
			)}
			<div className={css.cardInfo}>
				<div className={css.cardTitle}>{timer.Name}</div>
				<div className={css.cardMeta}>
					{timer.ChannelName}
				</div>
				<div className={css.cardSchedule}>
					{formatScheduledTime(timer.StartDate, timer.EndDate)}
				</div>
			</div>
		</SpottableDiv>
	);
};

const Recordings = ({onPlayRecording, onBack}) => {
	const {api, serverUrl} = useAuth();
	const [recordings, setRecordings] = useState([]);
	const [timers, setTimers] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [activeTab, setActiveTab] = useState('recordings');
	const [selectedItem, setSelectedItem] = useState(null);

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (selectedItem) {
				if (isBackKey(e)) {
					e.preventDefault();
					e.stopPropagation();
					setSelectedItem(null);
					return;
				}
				return;
			}

			if (isBackKey(e)) {
				e.preventDefault();
				onBack?.();
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [onBack, selectedItem]);

	useEffect(() => {
		const loadData = async () => {
			try {
				setIsLoading(true);
				const [recordingsResult, timersResult] = await Promise.all([
					api.getLiveTvRecordings(),
					api.getLiveTvTimers()
				]);
				setRecordings(recordingsResult.Items || []);
				setTimers(timersResult.Items || []);
			} catch (err) {
				console.error('Failed to load recordings:', err);
			} finally {
				setIsLoading(false);
			}
		};

		loadData();
	}, [api]);

	const handleSetRecordingsTab = useCallback(() => {
		setActiveTab('recordings');
	}, []);

	const handleSetScheduledTab = useCallback(() => {
		setActiveTab('scheduled');
	}, []);

	const handleSelectRecording = useCallback((recording) => {
		setSelectedItem({type: 'recording', item: recording});
	}, []);

	const handleSelectTimer = useCallback((timer) => {
		setSelectedItem({type: 'timer', item: timer});
	}, []);

	const handlePlaySelectedRecording = useCallback(() => {
		if (selectedItem?.item) {
			onPlayRecording?.(selectedItem.item);
		}
	}, [selectedItem, onPlayRecording]);

	const handleDeleteSelectedRecording = useCallback(async () => {
		if (selectedItem?.item?.Id) {
			try {
				await api.deleteItem(selectedItem.item.Id);
				setRecordings(prev => prev.filter(r => r.Id !== selectedItem.item.Id));
				setSelectedItem(null);
			} catch (err) {
				console.error('Failed to delete recording:', err);
			}
		}
	}, [api, selectedItem]);

	const handleCancelSelectedTimer = useCallback(async () => {
		if (selectedItem?.item?.Id) {
			try {
				await api.cancelLiveTvTimer(selectedItem.item.Id);
				setTimers(prev => prev.filter(t => t.Id !== selectedItem.item.Id));
				setSelectedItem(null);
			} catch (err) {
				console.error('Failed to cancel timer:', err);
			}
		}
	}, [api, selectedItem]);

	const handleClosePopup = useCallback(() => {
		setSelectedItem(null);
	}, []);

	const formatScheduledTime = useCallback((startDate, endDate) => {
		const start = new Date(startDate);
		const end = new Date(endDate);
		const dateOpts = {weekday: 'short', month: 'short', day: 'numeric'};
		const timeOpts = {hour: 'numeric', minute: '2-digit', hour12: true};

		return `${start.toLocaleDateString('en-US', dateOpts)} ${start.toLocaleTimeString('en-US', timeOpts)} - ${end.toLocaleTimeString('en-US', timeOpts)}`;
	}, []);

	if (isLoading) {
		return (
			<div className={css.page}>
				<div className={css.loadingContainer}>
					<LoadingSpinner />
					<p>Loading Recordings...</p>
				</div>
			</div>
		);
	}

	return (
		<div className={css.page}>
			<div className={css.header}>
				<div className={css.title}>Recordings</div>
				<div className={css.tabs}>
					<SpottableButton
						className={`${css.tab} ${activeTab === 'recordings' ? css.active : ''}`}
						onClick={handleSetRecordingsTab}
					>
						Recordings ({recordings.length})
					</SpottableButton>
					<SpottableButton
						className={`${css.tab} ${activeTab === 'scheduled' ? css.active : ''}`}
						onClick={handleSetScheduledTab}
					>
						Scheduled ({timers.length})
					</SpottableButton>
				</div>
			</div>

			<div className={css.content}>
				{activeTab === 'recordings' && (
					<div className={css.grid}>
						{recordings.length === 0 ? (
							<div className={css.empty}>No recordings found</div>
						) : (
							recordings.map(recording => (
								<RecordingCard
									key={recording.Id}
									recording={recording}
									serverUrl={serverUrl}
									onSelect={handleSelectRecording}
								/>
							))
						)}
					</div>
				)}

				{activeTab === 'scheduled' && (
					<div className={css.grid}>
						{timers.length === 0 ? (
							<div className={css.empty}>No scheduled recordings</div>
						) : (
							timers.map(timer => (
								<TimerCard
									key={timer.Id}
									timer={timer}
									serverUrl={serverUrl}
									formatScheduledTime={formatScheduledTime}
									onSelect={handleSelectTimer}
								/>
							))
						)}
					</div>
				)}
			</div>

			{selectedItem && (
				<div className={css.popup}>
					<div className={css.popupContent}>
						<div className={css.popupHeader}>
							<div className={css.popupTitle}>{selectedItem.item.Name}</div>
							{selectedItem.item.EpisodeTitle && (
								<div className={css.popupSubtitle}>{selectedItem.item.EpisodeTitle}</div>
							)}
						</div>

						<div className={css.popupBody}>
							{selectedItem.item.Overview && (
								<div className={css.popupOverview}>{selectedItem.item.Overview}</div>
							)}
							<div className={css.popupMeta}>
								<div>Channel: {selectedItem.item.ChannelName}</div>
								{selectedItem.type === 'timer' && (
									<div>
										Scheduled: {formatScheduledTime(selectedItem.item.StartDate, selectedItem.item.EndDate)}
									</div>
								)}
								{selectedItem.type === 'recording' && selectedItem.item.RunTimeTicks && (
									<div>Duration: {formatDuration(selectedItem.item.RunTimeTicks)}</div>
								)}
							</div>
						</div>

						<div className={css.popupActions}>
							{selectedItem.type === 'recording' && (
								<>
									<SpottableButton
										className={css.popupBtn}
										onClick={handlePlaySelectedRecording}
									>
										Play
									</SpottableButton>
									<SpottableButton
										className={`${css.popupBtn} ${css.danger}`}
										onClick={handleDeleteSelectedRecording}
									>
										Delete
									</SpottableButton>
								</>
							)}
							{selectedItem.type === 'timer' && (
								<SpottableButton
									className={`${css.popupBtn} ${css.danger}`}
									onClick={handleCancelSelectedTimer}
								>
									Cancel Recording
								</SpottableButton>
							)}
							<SpottableButton
								className={css.popupBtn}
								onClick={handleClosePopup}
							>
								Close
							</SpottableButton>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default Recordings;
