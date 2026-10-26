import {useState, useEffect, useCallback, useMemo, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {pointerHover} from '../../utils/focusScroll';
import LoadingSpinner from '../../components/LoadingSpinner';
import {formatClockTime, formatDayLabel} from '../../utils/clock';
import {useSettings} from '../../context/SettingsContext';
import IncompleteBadge from '../../components/IncompleteBadge';
import {
	canKeepAsComplete, keepAsComplete, refreshIncompleteRecordings, useIncompleteRecording
} from '../../services/incompleteRecordings';
import {formatDuration, getImageUrl} from '../../utils/helpers';
import {parseServerDate} from '../../utils/serverDate';
import {seriesChoiceFlags, seriesChoiceOf} from '../../utils/liveTvGuide';
import SeriesEpisodeChoices from '../../components/SeriesEpisodeChoices';

import css from './Recordings.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
// self-only on its own still lets a press at the edge reach the cards behind the
// scrim, so every direction is closed off as well.
const PopupContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''},
	preserveId: true
}, 'div');

const ICONS = {
	back: ['M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z'],
	dvr: ['M17.5 10.5h2v1h-2v-1zm-13 0h2v3h-2v-3zM21 3H3c-1.11 0-2 .89-2 2v14c0 1.1.89 2 2 2h18c1.11 0 2-.9 2-2V5c0-1.11-.89-2-2-2zM8 13.5c0 .85-.65 1.5-1.5 1.5H3V9h3.5c.85 0 1.5.65 1.5 1.5v3zm4.62 1.5h-1.5L9.37 9h1.5l1 3.43 1-3.43h1.5l-1.75 6zM21 11.5c0 .6-.4 1.15-.9 1.4L21 15h-1.5l-.85-2H17.5v2H16V9h3.5c.85 0 1.5.65 1.5 1.5v1z'],
	smartRecord: [
		'M9 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0-4C4.58 4 1 7.58 1 12s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z',
		'M17 4.26v2.09c2.33.82 4 3.04 4 5.65s-1.67 4.83-4 5.65v2.09c3.45-.89 6-4.01 6-7.74s-2.55-6.85-6-7.74z'
	]
};

const RecIcon = ({paths, className}) => (
	<svg className={className} viewBox="0 0 24 24">
		{paths.map((d, i) => <path key={i} d={d} />)}
	</svg>
);

// Core's image priority: a Thumb tag goes through the backdrop endpoint, then the
// primary image, then the parent's backdrop, and finally the placeholder icon.
const recordingImageUrl = (serverUrl, item) => {
	if (!item) return null;
	if (item.ImageTags?.Thumb) return getImageUrl(serverUrl, item.Id, 'Backdrop/0', {maxWidth: 600});
	if (item.ImageTags?.Primary) return getImageUrl(serverUrl, item.Id, 'Primary', {maxHeight: 450, tag: item.ImageTags.Primary});
	if (item.ParentThumbItemId) return getImageUrl(serverUrl, item.ParentThumbItemId, 'Backdrop/0', {maxWidth: 600});
	return null;
};

const joinParts = (...parts) => parts.filter(Boolean).join(' • ');

// A cancelled, finished or failed timer, or one whose showing is over, has nothing left to record.
const HIDDEN_TIMER_STATUSES = ['Cancelled', 'Completed', 'Error'];
const isUpcomingTimer = (timer, now) => HIDDEN_TIMER_STATUSES.indexOf(timer.Status) < 0 &&
	!(parseServerDate(timer.EndDate)?.getTime() <= now);

const Card = memo(({payload, imageUrl, title, subtitle, isSeries, isRecording, onSelect}) => {
	const [imgFailed, setImgFailed] = useState(false);

	const handleClick = useCallback(() => {
		onSelect(payload);
	}, [payload, onSelect]);

	const handleFocus = useCallback((e) => {
		if (pointerHover()) return;
		const el = e.currentTarget || e.target;
		if (!el) return;
		el.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'nearest'});
		// Scrolling only the card would leave its row's title above the top edge on the way up. A
		// row taller than the list keeps the card in view instead.
		const row = el.closest(`.${css.row}`);
		const list = row && row.closest(`.${css.body}`);
		if (list && row.offsetHeight <= list.clientHeight) row.scrollIntoView({behavior: 'smooth', block: 'nearest'});
	}, []);

	const handleImgError = useCallback(() => setImgFailed(true), []);

	return (
		<SpottableDiv className={css.card} onClick={handleClick} onFocus={handleFocus}>
			<div className={css.cardThumb}>
				{isRecording && <IncompleteBadge itemId={payload.Id} />}
				{imageUrl && !imgFailed ? (
					<img className={css.cardImage} src={imageUrl} alt="" loading="lazy" onError={handleImgError} />
				) : (
					<RecIcon
						className={`${css.placeholderIcon} ${isSeries ? css.seriesIcon : ''}`}
						paths={isSeries ? ICONS.smartRecord : ICONS.dvr}
					/>
				)}
			</div>
			<div className={css.cardTitle}>{title}</div>
			{subtitle && <div className={css.cardSubtitle}>{subtitle}</div>}
		</SpottableDiv>
	);
});

const Rail = ({title, children}) => (
	<div className={css.row}>
		{title && <div className={css.rowTitle}>{title}</div>}
		<div className={css.rail}>{children}</div>
	</div>
);

const friendlyDate = (date) => {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const day = new Date(date);
	day.setHours(0, 0, 0, 0);
	const diff = Math.round((day - today) / 86400000);
	if (diff === 0) return $L('Today');
	if (diff === 1) return $L('Tomorrow');
	if (diff === -1) return $L('Yesterday');
	return formatDayLabel(date);
};

// How much of the program a recording missed, and what the plugin found for the rest of it.
const incompleteDetail = (entry, clockDisplay) => {
	const at = (date) => `${formatDayLabel(new Date(date))} ${formatClockTime(new Date(date), clockDisplay)}`;
	let found = null;
	if (entry.state === 'scheduled' && entry.scheduledStart) found = $L('Complete showing scheduled {dateTime}').replace('{dateTime}', at(entry.scheduledStart));
	else if (entry.state === 'recorded' && entry.recordedAt) found = $L('Complete copy recorded {dateTime}').replace('{dateTime}', at(entry.recordedAt));
	else if (entry.state === 'notFound') found = $L('No complete showing found');
	const minutes = $L('{recorded} of {expected} min')
		.replace('{recorded}', entry.recordedMinutes)
		.replace('{expected}', entry.expectedMinutes);
	return [$L('Incomplete'), minutes, found].filter(Boolean).join(' · ');
};

const Recordings = ({onPlayRecording, onBack, backHandlerRef}) => {
	const {api, serverUrl} = useAuth();
	const {settings} = useSettings();
	const [recordingRows, setRecordingRows] = useState(null);
	const [timers, setTimers] = useState([]);
	const [seriesTimers, setSeriesTimers] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [activeTab, setActiveTab] = useState('recordings');
	const [selectedItem, setSelectedItem] = useState(null);
	const selectedIncomplete = useIncompleteRecording(selectedItem?.type === 'recording' ? selectedItem.item.Id : null);

	useEffect(() => {
		if (!backHandlerRef) return;
		const handler = () => {
			if (selectedItem) {
				setSelectedItem(null);
				return true;
			}
			return false;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, selectedItem]);

	useEffect(() => {
		// Core fires the category queries in parallel and lets any one of them fail
		// on its own, so a server without series flags just loses that rail.
		const loadData = async () => {
			setIsLoading(true);
			const [recent, series, movies, sports, kids, timersResult, seriesTimersResult] = await Promise.all([
				api.getLiveTvRecordings({limit: 40}).catch(() => null),
				api.getLiveTvRecordings({limit: 60, isSeries: true}).catch(() => null),
				api.getLiveTvRecordings({limit: 60, isMovie: true}).catch(() => null),
				api.getLiveTvRecordings({limit: 60, isSports: true}).catch(() => null),
				api.getLiveTvRecordings({limit: 60, isKids: true}).catch(() => null),
				api.getLiveTvTimers().catch(() => null),
				api.getLiveTvSeriesTimers().catch(() => null)
			]);
			setRecordingRows({
				recent: recent?.Items || [],
				series: series?.Items || [],
				movies: movies?.Items || [],
				sports: sports?.Items || [],
				kids: kids?.Items || []
			});
			const now = Date.now();
			setTimers((timersResult?.Items || []).filter((timer) => isUpcomingTimer(timer, now)));
			setSeriesTimers(seriesTimersResult?.Items || []);
			setIsLoading(false);
		};

		loadData();
		refreshIncompleteRecordings();
	}, [api]);

	// Timers airing within a day open the recordings tab, like core's first rail.
	const scheduledSoon = useMemo(() => {
		const cutoff = Date.now() + 86400000;
		return timers.filter(t => t.StartDate && new Date(t.StartDate).getTime() < cutoff);
	}, [timers]);

	const scheduleGroups = useMemo(() => {
		const groups = new Map();
		for (const timer of timers) {
			if (!timer.StartDate) continue;
			const start = new Date(timer.StartDate);
			const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
			if (!groups.has(key)) groups.set(key, {key, date: start, items: []});
			groups.get(key).items.push(timer);
		}
		return Array.from(groups.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
	}, [timers]);

	const recordingsCount = recordingRows
		? recordingRows.recent.length + recordingRows.series.length + recordingRows.movies.length +
			recordingRows.sports.length + recordingRows.kids.length
		: 0;

	const handleSetRecordingsTab = useCallback(() => setActiveTab('recordings'), []);
	const handleSetScheduleTab = useCallback(() => setActiveTab('schedule'), []);
	const handleSetSeriesTab = useCallback(() => setActiveTab('series'), []);

	// The popup is a spotlight container, so focus has to be handed to it
	// explicitly or it stays on the card behind the scrim.
	const openPopup = useCallback((type, item) => {
		setSelectedItem({type, item});
		setTimeout(() => {
			Spotlight.focus('recordings-popup');
		}, 100);
	}, []);

	const handleSelectRecording = useCallback((recording) => {
		openPopup('recording', recording);
	}, [openPopup]);

	const handleSelectTimer = useCallback((timer) => {
		openPopup('timer', timer);
	}, [openPopup]);

	const handleSelectSeriesTimer = useCallback((seriesTimer) => {
		openPopup('seriesTimer', seriesTimer);
	}, [openPopup]);

	const handlePlaySelectedRecording = useCallback(() => {
		if (selectedItem?.item) {
			onPlayRecording?.(selectedItem.item);
		}
	}, [selectedItem, onPlayRecording]);

	const handleDeleteSelectedRecording = useCallback(async () => {
		if (selectedItem?.item?.Id) {
			try {
				await api.deleteItem(selectedItem.item.Id);
				setRecordingRows(prev => {
					if (!prev) return prev;
					const next = {};
					for (const key of Object.keys(prev)) {
						next[key] = prev[key].filter(r => r.Id !== selectedItem.item.Id);
					}
					return next;
				});
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

	// A series rule decides which showings are booked, so the schedule is read again once it changes.
	const reloadTimers = useCallback(() => api.getLiveTvTimers().then((result) => {
		const now = Date.now();
		setTimers((result?.Items || []).filter((timer) => isUpcomingTimer(timer, now)));
	}, () => {}), [api]);

	const handleCancelSelectedSeriesTimer = useCallback(async () => {
		if (selectedItem?.item?.Id) {
			try {
				await api.cancelLiveTvSeriesTimer(selectedItem.item.Id);
				setSeriesTimers(prev => prev.filter(s => s.Id !== selectedItem.item.Id));
				reloadTimers();
				setSelectedItem(null);
			} catch (err) {
				console.error('Failed to cancel series timer:', err);
			}
		}
	}, [api, reloadTimers, selectedItem]);

	const handleClosePopup = useCallback(() => {
		setSelectedItem(null);
	}, []);

	const handleKeepAsComplete = useCallback(async () => {
		try {
			await keepAsComplete(selectedItem.item.Id);
			setSelectedItem(null);
		} catch (err) {
			console.error('Failed to mark recording as complete:', err);
		}
	}, [selectedItem]);

	const handleOpenSeriesSettings = useCallback(() => {
		openPopup('seriesChoice', selectedItem.item);
	}, [openPopup, selectedItem]);

	const handleSeriesChoice = useCallback(async (key) => {
		const rule = selectedItem.item;
		if (seriesChoiceOf(rule) !== key) {
			const updated = {...rule, ...seriesChoiceFlags(key)};
			try {
				await api.updateLiveTvSeriesTimer(rule.Id, updated);
				setSeriesTimers(prev => prev.map(s => (s.Id === rule.Id ? updated : s)));
				reloadTimers();
			} catch (err) {
				console.error('Failed to update series timer:', err);
				return;
			}
		}
		setSelectedItem(null);
	}, [api, reloadTimers, selectedItem]);

	const renderRecordingCard = useCallback((recording) => (
		<Card
			key={recording.Id}
			payload={recording}
			imageUrl={recordingImageUrl(serverUrl, recording)}
			title={recording.Name}
			subtitle={joinParts(recording.ChannelName, recording.EpisodeTitle)}
			isRecording
			onSelect={handleSelectRecording}
		/>
	), [serverUrl, handleSelectRecording]);

	// A timer card leans on its program info for artwork and the episode line.
	const renderTimerCard = useCallback((timer) => (
		<Card
			key={timer.Id}
			payload={timer}
			imageUrl={recordingImageUrl(serverUrl, timer.ProgramInfo)}
			title={timer.Name}
			subtitle={joinParts(timer.ChannelName, timer.ProgramInfo?.EpisodeTitle)}
			onSelect={handleSelectTimer}
		/>
	), [serverUrl, handleSelectTimer]);

	if (isLoading) {
		return (
			<div className={css.page}>
				<div className={css.loadingContainer}>
					<LoadingSpinner />
				</div>
			</div>
		);
	}

	const recordingRails = [
		{title: $L('Scheduled in Next 24 Hours'), items: scheduledSoon, render: renderTimerCard},
		{title: $L('Recent Recordings'), items: recordingRows.recent, render: renderRecordingCard},
		{title: $L('TV Series'), items: recordingRows.series, render: renderRecordingCard},
		{title: $L('Movies'), items: recordingRows.movies, render: renderRecordingCard},
		{title: $L('Sports'), items: recordingRows.sports, render: renderRecordingCard},
		{title: $L('Kids'), items: recordingRows.kids, render: renderRecordingCard}
	].filter(rail => rail.items.length > 0);

	return (
		<div className={css.page}>
			<div className={css.header}>
				<div className={css.title}>{$L('Recordings')}</div>
				<div className={css.pills}>
					<SpottableButton
						className={`${css.pill} ${activeTab === 'recordings' ? css.selected : ''}`}
						onClick={handleSetRecordingsTab}
					>
						{`${$L('Recordings')} (${recordingsCount})`}
					</SpottableButton>
					<SpottableButton
						className={`${css.pill} ${activeTab === 'schedule' ? css.selected : ''}`}
						onClick={handleSetScheduleTab}
					>
						{`${$L('Schedule')} (${timers.length})`}
					</SpottableButton>
					<SpottableButton
						className={`${css.pill} ${activeTab === 'series' ? css.selected : ''}`}
						onClick={handleSetSeriesTab}
					>
						{`${$L('Series Recordings')} (${seriesTimers.length})`}
					</SpottableButton>
					<SpottableButton
						className={`${css.pill} ${css.backPill}`}
						onClick={onBack}
						aria-label={$L('Go Back')}
					>
						<RecIcon paths={ICONS.back} />
					</SpottableButton>
				</div>
			</div>

			<div className={css.body}>
				{activeTab === 'recordings' && (
					recordingRails.length === 0 ? (
						<div className={css.empty}>{$L('No recordings found')}</div>
					) : (
						recordingRails.map(rail => (
							<Rail key={rail.title} title={rail.title}>
								{rail.items.map(rail.render)}
							</Rail>
						))
					)
				)}

				{activeTab === 'schedule' && (
					scheduleGroups.length === 0 ? (
						<div className={css.empty}>{$L('No scheduled recordings')}</div>
					) : (
						scheduleGroups.map(group => (
							<Rail key={group.key} title={friendlyDate(group.date)}>
								{group.items.map(renderTimerCard)}
							</Rail>
						))
					)
				)}

				{activeTab === 'series' && (
					seriesTimers.length === 0 ? (
						<div className={css.empty}>{$L('No series recordings')}</div>
					) : (
						<Rail>
							{seriesTimers.map(seriesTimer => (
								<Card
									key={seriesTimer.Id}
									payload={seriesTimer}
									imageUrl={null}
									title={seriesTimer.Name}
									subtitle={joinParts(
										seriesTimer.RecordAnyChannel ? $L('All channels') : seriesTimer.ChannelName,
										seriesTimer.DayPattern
									)}
									isSeries
									onSelect={handleSelectSeriesTimer}
								/>
							))}
						</Rail>
					)
				)}
			</div>

			{selectedItem && selectedItem.type === 'recording' && (
				<div className={css.dialogScrim}>
					<PopupContainer className={css.dialog} spotlightId="recordings-popup">
						<div className={css.dialogTitle}>{selectedItem.item.Name}</div>
						<div className={css.dialogBody}>
							{selectedItem.item.EpisodeTitle && (
								<div className={css.dialogSubtitle}>{selectedItem.item.EpisodeTitle}</div>
							)}
							{selectedItem.item.Overview && (
								<div className={css.dialogOverview}>{selectedItem.item.Overview}</div>
							)}
							<div className={css.dialogMeta}>
								{joinParts(
									selectedItem.item.ChannelName,
									selectedItem.item.RunTimeTicks ? formatDuration(selectedItem.item.RunTimeTicks) : ''
								)}
							</div>
							{selectedIncomplete && (
								<div className={css.incompleteLine}>{incompleteDetail(selectedIncomplete, settings.clockDisplay)}</div>
							)}
						</div>
						<div className={css.dialogActions}>
							<SpottableButton
								className={`${css.dialogBtn} spottable-default`}
								onClick={handlePlaySelectedRecording}
							>
								{$L('Play')}
							</SpottableButton>
							{selectedIncomplete && canKeepAsComplete() && (
								<SpottableButton className={css.dialogBtn} onClick={handleKeepAsComplete}>
									{$L('Keep as Complete')}
								</SpottableButton>
							)}
							<SpottableButton
								className={`${css.dialogBtn} ${css.danger}`}
								onClick={handleDeleteSelectedRecording}
							>
								{$L('Delete')}
							</SpottableButton>
							<SpottableButton className={css.dialogBtn} onClick={handleClosePopup}>
								{$L('Close')}
							</SpottableButton>
						</div>
					</PopupContainer>
				</div>
			)}

			{selectedItem && selectedItem.type === 'timer' && (
				<div className={css.dialogScrim}>
					<PopupContainer className={`${css.dialog} ${css.confirmDialog}`} spotlightId="recordings-popup">
						<div className={css.dialogTitle}>{$L('Cancel Recording?')}</div>
						<div className={css.dialogBody}>
							<div className={css.dialogText}>
								{$L('Cancel scheduled recording of "{name}"?').replace('{name}', selectedItem.item.Name)}
							</div>
						</div>
						<div className={css.dialogActions}>
							{/* No is the default target so a stray OK press can't cancel anything. */}
							<SpottableButton
								className={`${css.dialogBtn} spottable-default`}
								onClick={handleClosePopup}
							>
								{$L('No')}
							</SpottableButton>
							<SpottableButton
								className={`${css.dialogBtn} ${css.danger}`}
								onClick={handleCancelSelectedTimer}
							>
								{$L('Yes, Cancel')}
							</SpottableButton>
						</div>
					</PopupContainer>
				</div>
			)}

			{selectedItem && selectedItem.type === 'seriesTimer' && (
				<div className={css.dialogScrim}>
					<PopupContainer className={`${css.dialog} ${css.confirmDialog}`} spotlightId="recordings-popup">
						<div className={css.dialogTitle}>{selectedItem.item.Name}</div>
						<div className={css.dialogActions}>
							<SpottableButton
								className={`${css.dialogBtn} spottable-default`}
								onClick={handleClosePopup}
							>
								{$L('Close')}
							</SpottableButton>
							<SpottableButton className={css.dialogBtn} onClick={handleOpenSeriesSettings}>
								{$L('Series Settings')}
							</SpottableButton>
							<SpottableButton
								className={`${css.dialogBtn} ${css.danger}`}
								onClick={handleCancelSelectedSeriesTimer}
							>
								{$L('Cancel Series Recording')}
							</SpottableButton>
						</div>
					</PopupContainer>
				</div>
			)}

			{selectedItem && selectedItem.type === 'seriesChoice' && (
				<div className={css.dialogScrim}>
					<PopupContainer className={css.dialog} spotlightId="recordings-popup">
						<div className={css.dialogTitle}>{$L('Which episodes should be recorded?')}</div>
						<div className={css.dialogBody}>
							<SeriesEpisodeChoices selected={seriesChoiceOf(selectedItem.item)} onPick={handleSeriesChoice} />
						</div>
					</PopupContainer>
				</div>
			)}
		</div>
	);
};

export default Recordings;
