import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import {useAuth} from '../../context/AuthContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import {isBackKey} from '../../utils/tizenKeys';

import css from './LiveTV.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const GuideControls = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');
const PopupContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	preserveId: true
}, 'div');

const HOURS_TO_DISPLAY = 6;
const PIXELS_PER_HOUR = 600;
const MINUTES_PER_PIXEL = 60 / PIXELS_PER_HOUR;
const CHANNELS_PER_BATCH = 50;

const ProgramCell = ({program, channel, style, isCurrent, onProgramClick}) => {
	const handleClick = useCallback(() => {
		onProgramClick(program, channel);
	}, [program, channel, onProgramClick]);

	return (
		<SpottableDiv
			className={`${css.programCell} ${isCurrent ? css.current : ''}`}
			style={style}
			onClick={handleClick}
			data-program-id={program.Id}
		>
			<div className={css.programTime}>
				{new Date(program.StartDate).toLocaleTimeString('en-US', {
					hour: 'numeric',
					minute: '2-digit',
					hour12: true
				})}
			</div>
			<div className={css.programTitle}>{program.Name}</div>
			{program.EpisodeTitle && (
				<div className={css.programEpisode}>{program.EpisodeTitle}</div>
			)}
		</SpottableDiv>
	);
};

const LiveTV = ({onPlayChannel, onBack, onRecordings}) => {
	const {api, serverUrl} = useAuth();
	const [channels, setChannels] = useState([]);
	const [programs, setPrograms] = useState({});
	const [currentDate, setCurrentDate] = useState(new Date());
	const [isLoading, setIsLoading] = useState(true);
	const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
	const [selectedProgram, setSelectedProgram] = useState(null);
	const [focusMode, setFocusMode] = useState('grid');
	const [channelNumberBuffer, setChannelNumberBuffer] = useState('');

	const guideContentRef = useRef(null);
	const timeSlotsRef = useRef(null);
	const channelNumberTimeoutRef = useRef(null);
	const currentChannelIndexRef = useRef(0);
	const hasMoreChannelsRef = useRef(true);

	const getGuideStartTime = useCallback(() => {
		const start = new Date(currentDate);
		const currentHour = new Date().getHours();
		start.setHours(currentHour, 0, 0, 0);
		return start;
	}, [currentDate]);

	const getGuideEndTime = useCallback(() => {
		const end = new Date(getGuideStartTime());
		end.setHours(end.getHours() + HOURS_TO_DISPLAY);
		return end;
	}, [getGuideStartTime]);

	const getCurrentTimePosition = useCallback(() => {
		const startTime = getGuideStartTime();
		const now = new Date();
		const minutesSinceStart = (now - startTime) / (1000 * 60);
		return minutesSinceStart / MINUTES_PER_PIXEL;
	}, [getGuideStartTime]);

	const loadChannels = useCallback(async (reset = false) => {
		if (reset) {
			currentChannelIndexRef.current = 0;
			hasMoreChannelsRef.current = true;
			setChannels([]);
			setPrograms({});
		}

		if (!hasMoreChannelsRef.current) return;

		try {
			const result = await api.getLiveTvChannels(currentChannelIndexRef.current, CHANNELS_PER_BATCH);
			const newChannels = result.Items || [];

			if (newChannels.length === 0) {
				hasMoreChannelsRef.current = false;
				return;
			}

			const startTime = getGuideStartTime();
			const endTime = getGuideEndTime();
			const channelIds = newChannels.map(ch => ch.Id);

			const programsResult = await api.getLiveTvPrograms(channelIds, startTime, endTime);
			const allPrograms = programsResult.Items || [];

			const programsByChannel = {};
			allPrograms.forEach(program => {
				const channelId = program.ChannelId;
				if (!programsByChannel[channelId]) {
					programsByChannel[channelId] = [];
				}
				programsByChannel[channelId].push(program);
			});

			setChannels(prev => reset ? newChannels : [...prev, ...newChannels]);
			setPrograms(prev => ({...prev, ...programsByChannel}));

			currentChannelIndexRef.current += newChannels.length;
			if (newChannels.length < CHANNELS_PER_BATCH) {
				hasMoreChannelsRef.current = false;
			}
		} catch (err) {
			console.error('Failed to load channels:', err);
		}
	}, [api, getGuideStartTime, getGuideEndTime]);

	useEffect(() => {
		const init = async () => {
			setIsLoading(true);
			await loadChannels(true);
			setIsLoading(false);
		};
		init();
	}, [loadChannels, currentDate]);

	const handleChannelNumber = useCallback((digit) => {
		if (channelNumberTimeoutRef.current) {
			clearTimeout(channelNumberTimeoutRef.current);
		}

		setChannelNumberBuffer(prev => prev + digit);

		channelNumberTimeoutRef.current = setTimeout(() => {
			const channelNum = channelNumberBuffer + digit;
			const channel = channels.find(ch => ch.ChannelNumber === channelNum);
			if (channel) {
				const row = document.querySelector(`[data-channel-id="${channel.Id}"]`);
				if (row) {
					row.scrollIntoView({behavior: 'smooth', block: 'center'});
				}
			}
			setChannelNumberBuffer('');
		}, 1500);
	}, [channelNumberBuffer, channels]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			const keyCode = e.keyCode;

			if (selectedProgram) {
				if (isBackKey(e)) {
					e.preventDefault();
					e.stopPropagation();
					setSelectedProgram(null);
					return;
				}
				return;
			}

			if (keyCode >= 48 && keyCode <= 57) {
				e.preventDefault();
				handleChannelNumber(String.fromCharCode(keyCode));
				return;
			}

			if (isBackKey(e)) {
				e.preventDefault();
				onBack?.();
				return;
			}

			if (keyCode === 38) {
				const focused = Spotlight.getCurrent();
				if (focused && (focused.id === 'prev-day' || focused.id === 'next-day' || focused.id === 'today' || focused.id === 'filter' || focused.id === 'recordings')) {
					e.preventDefault();
					Spotlight.focus('navbar');
					return;
				}

				const guideContent = guideContentRef.current;
				if (guideContent && guideContent.scrollTop < 50) {
					const programCell = focused?.closest('[data-program-id]');
					if (programCell) {
						e.preventDefault();
						Spotlight.focus('livetv-guide');
						return;
					}
				}
			}

			if (focusMode === 'controls') {
				if (keyCode === 40) {
					e.preventDefault();
					setFocusMode('grid');
					Spotlight.focus('program-grid');
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [onBack, selectedProgram, focusMode, handleChannelNumber]);

	const handleScroll = useCallback(() => {
		const guideContent = guideContentRef.current;
		if (!guideContent) return;

		const scrollPosition = guideContent.scrollTop + guideContent.clientHeight;
		const scrollHeight = guideContent.scrollHeight;

		if (scrollPosition >= scrollHeight - 500 && hasMoreChannelsRef.current && !isLoading) {
			loadChannels();
		}

		if (timeSlotsRef.current) {
			timeSlotsRef.current.scrollLeft = guideContent.scrollLeft;
		}
	}, [loadChannels, isLoading]);

	const changeDay = useCallback((days) => {
		setCurrentDate(prev => {
			const newDate = new Date(prev);
			newDate.setDate(newDate.getDate() + days);
			return newDate;
		});
	}, []);

	const goToToday = useCallback(() => {
		setCurrentDate(new Date());
	}, []);

	const toggleFavorites = useCallback(() => {
		setShowFavoritesOnly(prev => !prev);
	}, []);

	const handleProgramClick = useCallback((program, channel) => {
		setSelectedProgram({program, channel});
		setTimeout(() => {
			Spotlight.focus('livetv-popup');
		}, 100);
	}, []);

	const handleWatchChannel = useCallback(() => {
		if (selectedProgram?.channel) {
			onPlayChannel?.(selectedProgram.channel);
		}
	}, [selectedProgram, onPlayChannel]);

	const handlePrevDay = useCallback(() => {
		changeDay(-1);
	}, [changeDay]);

	const handleNextDay = useCallback(() => {
		changeDay(1);
	}, [changeDay]);

	const handleClosePopup = useCallback(() => {
		setSelectedProgram(null);
	}, []);

	const formatDate = useCallback((date) => {
		const options = {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'};
		return date.toLocaleDateString('en-US', options);
	}, []);

	const timeSlots = useMemo(() => {
		const slots = [];
		const startTime = getGuideStartTime();
		const totalSlots = HOURS_TO_DISPLAY * 2;

		for (let i = 0; i < totalSlots; i++) {
			const slotTime = new Date(startTime);
			slotTime.setMinutes(slotTime.getMinutes() + (i * 30));
			slots.push({
				time: slotTime,
				label: slotTime.toLocaleTimeString('en-US', {
					hour: 'numeric',
					minute: '2-digit',
					hour12: true
				})
			});
		}
		return slots;
	}, [getGuideStartTime]);

	const filteredChannels = useMemo(() => {
		if (!showFavoritesOnly) return channels;
		return channels.filter(ch => ch.UserData?.IsFavorite);
	}, [channels, showFavoritesOnly]);

	const calculateProgramStyle = useCallback((program) => {
		const startTime = getGuideStartTime();
		const guideEndTime = getGuideEndTime();
		const programStart = new Date(program.StartDate);
		const programEnd = new Date(program.EndDate);

		if (programEnd <= startTime || programStart >= guideEndTime) return null;

		const minutesFromStart = (programStart - startTime) / (1000 * 60);
		const durationMinutes = (programEnd - programStart) / (1000 * 60);

		let left = minutesFromStart / MINUTES_PER_PIXEL;
		let width = durationMinutes / MINUTES_PER_PIXEL;

		if (left < 0) {
			width = width + left;
			left = 0;
		}

		if (width < 10) return null;

		return {
			left: `${left}px`,
			width: `${width - 6}px`
		};
	}, [getGuideStartTime, getGuideEndTime]);

	const isCurrentProgram = useCallback((program) => {
		const now = new Date();
		const start = new Date(program.StartDate);
		const end = new Date(program.EndDate);
		return now >= start && now < end;
	}, []);

	const currentTimePosition = useMemo(() => {
		const pos = getCurrentTimePosition();
		return pos >= 0 && pos <= HOURS_TO_DISPLAY * PIXELS_PER_HOUR ? pos : null;
	}, [getCurrentTimePosition]);

	if (isLoading && channels.length === 0) {
		return (
			<div className={css.page}>
				<div className={css.loadingContainer}>
					<LoadingSpinner />
					<p>Loading TV Guide...</p>
				</div>
			</div>
		);
	}

	return (
		<div className={css.page}>
			<div className={css.guideContainer}>
				<div className={css.guideHeader}>
					<div className={css.guideTitle}>Live TV Guide</div>
					<GuideControls className={css.guideControls} spotlightId="livetv-guide">
						<SpottableButton
							className={css.guideBtn}
							onClick={handlePrevDay}
							spotlightId="prev-day"
						>
							◀ Previous Day
						</SpottableButton>
						<div className={css.guideDate}>{formatDate(currentDate)}</div>
						<SpottableButton
							className={css.guideBtn}
							onClick={handleNextDay}
							spotlightId="next-day"
						>
							Next Day ▶
						</SpottableButton>
						<SpottableButton
							className={css.guideBtn}
							onClick={goToToday}
							spotlightId="today"
						>
							Today
						</SpottableButton>
						<SpottableButton
							className={`${css.guideBtn} ${showFavoritesOnly ? css.active : ''}`}
							onClick={toggleFavorites}
							spotlightId="filter"
						>
							{showFavoritesOnly ? 'All Channels' : 'Favorites'}
						</SpottableButton>
						<SpottableButton
							className={`${css.guideBtn} ${css.recordingsBtn}`}
							onClick={onRecordings}
							spotlightId="recordings"
						>
							Recordings
						</SpottableButton>
					</GuideControls>
				</div>

				<div className={css.guideGridContainer}>
					<div className={css.timeHeader}>
						<div className={css.channelColumnSpacer} />
						<div className={css.timeSlots} ref={timeSlotsRef}>
							{timeSlots.map((slot, idx) => (
								<div
									key={idx}
									className={css.timeSlot}
									style={{width: `${PIXELS_PER_HOUR / 2}px`}}
								>
									{slot.label}
								</div>
							))}
						</div>
					</div>

					<div
						className={css.guideContent}
						ref={guideContentRef}
						onScroll={handleScroll}
						data-spotlight-container=""
						data-spotlight-id="program-grid"
					>
						{filteredChannels.map(channel => (
							<div
								key={channel.Id}
								className={css.channelRow}
								data-channel-id={channel.Id}
							>
								<div className={css.channelInfo}>
									<div className={css.channelNumber}>{channel.ChannelNumber}</div>
									<div className={css.channelName}>{channel.Name}</div>
									{channel.ImageTags?.Primary && (
										<img
											className={css.channelLogo}
											src={`${serverUrl}/Items/${channel.Id}/Images/Primary?maxWidth=120&quality=90`}
											alt=""
										/>
									)}
								</div>
								<div
									className={css.programsContainer}
									style={{width: `${HOURS_TO_DISPLAY * PIXELS_PER_HOUR}px`}}
								>
									{currentTimePosition !== null && (
										<div
											className={css.currentTimeIndicator}
											style={{left: `${currentTimePosition}px`}}
										/>
									)}
									{(programs[channel.Id] || []).map(program => {
										const style = calculateProgramStyle(program);
										if (!style) return null;

										const isCurrent = isCurrentProgram(program);

										return (
											<ProgramCell
												key={program.Id}
												program={program}
												channel={channel}
												style={style}
												isCurrent={isCurrent}
												onProgramClick={handleProgramClick}
											/>
										);
									})}
								</div>
							</div>
						))}

						{filteredChannels.length === 0 && (
							<div className={css.empty}>
								{showFavoritesOnly ? 'No favorite channels' : 'No channels available'}
							</div>
						)}
					</div>
				</div>
			</div>

			{channelNumberBuffer && (
				<div className={css.channelNumberOverlay}>
					{channelNumberBuffer}
				</div>
			)}

			{selectedProgram && (
				<div className={css.programPopup}>
				<PopupContainer className={css.popupContent} spotlightId="livetv-popup">
						<div className={css.popupHeader}>
							<div className={css.popupTitle}>
								{selectedProgram.program.Name}
								{selectedProgram.program.ParentIndexNumber && selectedProgram.program.IndexNumber && (
									<span> - S{selectedProgram.program.ParentIndexNumber}E{selectedProgram.program.IndexNumber}</span>
								)}
							</div>
							{selectedProgram.program.EpisodeTitle && (
								<div className={css.popupSubtitle}>{selectedProgram.program.EpisodeTitle}</div>
							)}
							<div className={css.popupTime}>
								{new Date(selectedProgram.program.StartDate).toLocaleTimeString('en-US', {
									hour: 'numeric',
									minute: '2-digit',
									hour12: true
								})}
								{' - '}
								{new Date(selectedProgram.program.EndDate).toLocaleTimeString('en-US', {
									hour: 'numeric',
									minute: '2-digit',
									hour12: true
								})}
							</div>
						</div>

						<div className={css.popupBody}>
							{(selectedProgram.program.ImageTags?.Primary || selectedProgram.program.SeriesId) && (
								<div className={css.popupImageContainer}>
									<img
										src={`${serverUrl}/Items/${selectedProgram.program.ImageTags?.Primary ? selectedProgram.program.Id : selectedProgram.program.SeriesId}/Images/Primary?maxWidth=300&quality=90`}
										alt=""
									/>
								</div>
							)}
							<div className={css.popupInfo}>
								<div className={css.popupOverview}>
									{selectedProgram.program.Overview || 'No description available.'}
								</div>
								<div className={css.popupMetadata}>
									<div className={css.metadataItem}>
										<span className={css.metadataLabel}>Channel:</span>
										<span className={css.metadataValue}>{selectedProgram.channel.Name}</span>
									</div>
									{selectedProgram.program.ProductionYear && (
										<div className={css.metadataItem}>
											<span className={css.metadataLabel}>Year:</span>
											<span className={css.metadataValue}>{selectedProgram.program.ProductionYear}</span>
										</div>
									)}
									{selectedProgram.program.OfficialRating && (
										<div className={css.metadataItem}>
											<span className={css.metadataLabel}>Rating:</span>
											<span className={css.metadataValue}>{selectedProgram.program.OfficialRating}</span>
										</div>
									)}
									{selectedProgram.program.Genres?.length > 0 && (
										<div className={css.metadataItem}>
											<span className={css.metadataLabel}>Genres:</span>
											<span className={css.metadataValue}>{selectedProgram.program.Genres.join(', ')}</span>
										</div>
									)}
								</div>
							</div>
						</div>

						<div className={css.popupActions}>
							{isCurrentProgram(selectedProgram.program) && (
								<SpottableButton
									className={`${css.popupBtn} spottable-default`}
									onClick={handleWatchChannel}
									spotlightId="popup-watch"
								>
									Watch Now
								</SpottableButton>
							)}
							<SpottableButton
								className={`${css.popupBtn} ${!isCurrentProgram(selectedProgram.program) ? 'spottable-default' : ''}`}
								onClick={handleClosePopup}
								spotlightId="popup-close"
							>
								Close
							</SpottableButton>
						</div>
					</PopupContainer>
				</div>
			)}
		</div>
	);
};

export default LiveTV;
