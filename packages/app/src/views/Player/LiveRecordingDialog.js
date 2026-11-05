import {useState} from 'react';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';

import TrackOptionRow, {TrackDivider} from '../../components/TrackOptionRow';
import SeriesEpisodeChoices from '../../components/SeriesEpisodeChoices';
import {useRecordPrompt} from '../../components/RecordPrompt';
import {ModalContainer} from '../../utils/spotlightContainers';
import {formatClockTime, formatDayLabel} from '../../utils/clock';
import {DEFAULT_SERIES_CHOICE, episodeLine, programEnd, programStart, seriesChoiceOf} from '../../utils/liveTvGuide';

import recCss from './LiveRecordingDialog.module.less';

// What the Record button in the live player opens: the airing program's recording, its series
// rule, and the episode choice a new or changed series rule asks for.
const LiveRecordingDialog = ({css, recording, clockDisplay, channel, onClose, stopPropagation}) => {
	const [view, setView] = useState(null);
	const [recordingAiring, setRecordingAiring] = useState(false);
	const {prompt, setLoading, element: promptElement} = useRecordPrompt(clockDisplay);
	const {program, timer, seriesTimerId, nextSeriesRecording} = recording;

	const act = (action) => {
		onClose();
		action();
	};

	const show = (next) => {
		setView(next);
		window.requestAnimationFrame(() => Spotlight.focus('record-modal'));
	};

	const handleSeriesSettings = () => {
		recording.loadSeriesRule().then((rule) => (rule ? show({type: 'series', rule}) : onClose()));
	};

	// The Record prompt takes over from this dialog while it's needed, and the dialog closes once
	// the recording is set or the prompt is backed out of.
	const handleRecord = () => {
		if (timer) {
			act(recording.cancel);
			return;
		}
		setRecordingAiring(true);
		recording.record({prompt, setLoading, channel}).then(onClose);
	};

	const frame = (title, body) => (
		<div className={css.trackModal} onClick={onClose}>
			<ModalContainer className={css.modalContent} onClick={stopPropagation} data-modal="record" spotlightId="record-modal">
				<h2 className={css.modalTitle}>{title}</h2>
				{body}
			</ModalContainer>
		</div>
	);

	if (recordingAiring) return promptElement;

	if (view?.type === 'series') {
		const {rule} = view;
		return frame($L('Which episodes should be recorded?'), (
			<div className={css.trackList}>
				<SeriesEpisodeChoices
					selected={rule ? seriesChoiceOf(rule) : DEFAULT_SERIES_CHOICE}
					onPick={(key) => act(() => (rule ? recording.updateSeries(rule, key) : recording.recordSeries(key)))} // eslint-disable-line react/jsx-no-bind
				/>
			</div>
		));
	}

	const nextSeriesDate = nextSeriesRecording ? new Date(nextSeriesRecording.StartDate) : null;
	const programEpisodeLine = episodeLine(program);

	return frame(program.Name, (
		<>
			<div className={recCss.details}>
				<div>{`${formatClockTime(new Date(programStart(program)), clockDisplay)} – ${formatClockTime(new Date(programEnd(program)), clockDisplay)}`}</div>
				{programEpisodeLine && <div>{programEpisodeLine}</div>}
				{seriesTimerId && !timer && <div className={recCss.note}>{$L('The series recording will skip this showing')}</div>}
				{seriesTimerId && (
					<div className={recCss.note}>
						{nextSeriesDate
							? $L('Next series recording: {dateTime}').replace('{dateTime}', `${formatDayLabel(nextSeriesDate)} · ${formatClockTime(nextSeriesDate, clockDisplay)}`)
							: $L('Series recording is scheduled, but the guide has no upcoming episodes')}
					</div>
				)}
			</div>
			<div className={css.trackList}>
				<TrackOptionRow
					label={timer ? $L('Cancel This Recording') : (program.IsSeries ? $L('Record This Episode') : $L('Record This Program'))}
					onClick={handleRecord} // eslint-disable-line react/jsx-no-bind
				/>
				{seriesTimerId && (
					<TrackOptionRow
						label={$L('Series Settings')}
						onClick={handleSeriesSettings} // eslint-disable-line react/jsx-no-bind
					/>
				)}
				{(seriesTimerId || program.IsSeries) && (
					<TrackOptionRow
						label={seriesTimerId ? $L('Cancel Series Recording') : $L('Record Series')}
						onClick={() => (seriesTimerId ? act(recording.cancelSeries) : show({type: 'series', rule: null}))} // eslint-disable-line react/jsx-no-bind
					/>
				)}
				<TrackDivider />
				{/* Close holds focus when the dialog opens, so a stray OK changes nothing. */}
				<TrackOptionRow label={$L('Close')} data-selected="true" onClick={onClose} />
			</div>
		</>
	));
};

// Answers each recording action, over the player whether the controls are up or not.
export const LiveRecordingToast = ({toast, onDone}) => (
	toast ? <div key={toast.key} className={recCss.toast} onAnimationEnd={onDone}>{toast.message}</div> : null
);

export default LiveRecordingDialog;
