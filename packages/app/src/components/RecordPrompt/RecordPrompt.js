import {useLayoutEffect, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';

import VerticalMarquee from '../VerticalMarquee';
import {formatClockTime, formatDayLabel, formatShowingTime} from '../../utils/clock';
import {DESCRIPTION_MS_PER_PIXEL} from '../../utils/liveTvGuide';
import {
	RECORD_CHOICE, descriptionsDiffer, laterShowingWhen, recordPromptChannel
} from '../../utils/recordAiring';

import css from './RecordPrompt.module.less';

const SpottableButton = Spottable('button');

// self-only on its own still lets a press at the edge reach the screen behind the scrim, so every
// direction is closed off as well.
const PromptContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''},
	preserveId: true
}, 'div');

const DESCRIPTION_LINES = 2;
const DESCRIPTION_LINE_HEIGHT = 21 * 1.3;

const ICONS = {
	warning: 'M12 6 19.55 18.98H4.45L12 6ZM2.72 18C1.97 19.31 2.95 21 4.45 21H19.55C21.05 21 22.03 19.31 21.28 18L13.73 4.97C12.94 3.66 11.06 3.66 10.27 4.97L2.72 18ZM11.02 11.02V12.98C11.02 13.55 11.44 14.02 12 14.02C12.56 14.02 12.98 13.55 12.98 12.98V11.02C12.98 10.45 12.56 9.98 12 9.98C11.44 9.98 11.02 10.45 11.02 11.02ZM11.02 15.98H12.98V18H11.02V15.98Z',
	compare: 'M9 14.02H3C2.44 14.02 2.02 14.44 2.02 15C2.02 15.56 2.44 15.98 3 15.98H9V17.81C9 18.23 9.56 18.47 9.84 18.14L12.66 15.33C12.84 15.14 12.84 14.86 12.66 14.62L9.84 11.86C9.56 11.53 9 11.77 9 12.19V14.02ZM15 11.81V9.98H21C21.56 9.98 21.98 9.56 21.98 9C21.98 8.44 21.56 8.02 21 8.02H15V6.19C15 5.77 14.44 5.53 14.16 5.86L11.34 8.67C11.16 8.86 11.16 9.14 11.34 9.38L14.16 12.14C14.44 12.47 15 12.23 15 11.81Z',
	check: 'M12 2.02C6.47 2.02 2.02 6.47 2.02 12C2.02 17.53 6.47 21.98 12 21.98C17.53 21.98 21.98 17.53 21.98 12C21.98 6.47 17.53 2.02 12 2.02ZM12 20.02C7.59 20.02 3.98 16.41 3.98 12C3.98 7.59 7.59 3.98 12 3.98C16.41 3.98 20.02 7.59 20.02 12C20.02 16.41 16.41 20.02 12 20.02ZM15.89 8.3 9.98 14.16 8.11 12.28C7.73 11.91 7.08 11.91 6.7 12.28C6.33 12.7 6.33 13.31 6.7 13.69L9.28 16.31C9.7 16.69 10.31 16.69 10.69 16.31L17.3 9.7C17.67 9.33 17.67 8.67 17.3 8.3C16.92 7.92 16.27 7.92 15.89 8.3Z',
	scheduled: 'M15.98 10.55C15.7 10.22 15.23 10.22 14.95 10.55L10.59 14.86L9 13.31C8.72 12.98 8.25 12.98 7.92 13.31C7.64 13.59 7.64 14.06 7.92 14.34L9.89 16.31C10.27 16.69 10.92 16.69 11.3 16.31L15.98 11.58C16.31 11.3 16.31 10.83 15.98 10.55ZM18.98 3H18V2.02C18 1.45 17.53 0.98 17.02 0.98C16.45 0.98 15.98 1.45 15.98 2.02V3H8.02V2.02C8.02 1.45 7.55 0.98 6.98 0.98C6.47 0.98 6 1.45 6 2.02V3H5.02C3.89 3 3 3.89 3 5.02V18.98C3 20.11 3.89 21 5.02 21H18.98C20.11 21 21 20.11 21 18.98V5.02C21 3.89 20.11 3 18.98 3ZM18 18.98H6C5.44 18.98 5.02 18.56 5.02 18V8.02H18.98V18C18.98 18.56 18.56 18.98 18 18.98Z'
};

const Icon = ({path, className}) => (
	<svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
);

const plural = (count, one, other) => (count === 1 ? one : other.replace('{minutes}', count));

// One airing on the prompt: a label, when and where it airs, and its description, scrolling
// when it runs past two lines.
const ShowingCard = ({label, when, progress, progressLabel, description, status}) => (
	<div className={css.card}>
		<div className={css.cardHeader}>
			<span className={css.cardLabel}>{label}</span>
			{status && (
				<span className={css.cardStatus}>
					<Icon path={ICONS.scheduled} className={css.statusIcon} />
					{status}
				</span>
			)}
		</div>
		<div className={css.cardWhen}>{when}</div>
		{progress != null && (
			<div className={css.progressRow}>
				<div className={css.progressTrack}><div className={css.progressFill} style={{width: `${progress * 100}%`}} /></div>
				{progressLabel && <span className={css.progressLabel}>{progressLabel}</span>}
			</div>
		)}
		{description && (
			<VerticalMarquee
				className={css.cardDescription}
				text={description}
				lines={DESCRIPTION_LINES}
				lineHeight={DESCRIPTION_LINE_HEIGHT}
				msPerPixel={DESCRIPTION_MS_PER_PIXEL}
				pauseMs={1600}
			/>
		)}
	</div>
);

const PromptNote = ({path, text, caution}) => (
	<div className={`${css.note} ${caution ? css.caution : ''}`}>
		<Icon path={path} className={css.noteIcon} />
		<span>{text}</span>
	</div>
);

// Asks whether to also record a later showing of a program that has already started, showing the
// airing now and the future one as labelled cards so it's clear which is which. A cautious match
// puts the default on recording only what airs now.
const RecordPrompt = ({programName, airing, suggestion, searchForCompleteShowing, clockDisplay, onChoose}) => {
	const [now] = useState(() => new Date());
	const uncertain = Boolean(suggestion) && !searchForCompleteShowing;
	const differ = Boolean(suggestion) && descriptionsDiffer(airing.description, suggestion.description);
	const cautious = uncertain || differ;
	const elapsedMinutes = Math.floor((now - airing.start) / 60000);
	const length = airing.end ? airing.end - airing.start : null;
	const progress = length && length > 0 ? Math.min(1, Math.max(0, (now - airing.start) / length)) : null;
	const clock = (date) => formatClockTime(date, clockDisplay);
	const laterWhen = suggestion ? laterShowingWhen(suggestion.start, clockDisplay, now) : null;
	const laterChannel = suggestion ? recordPromptChannel(suggestion.channelNumber, suggestion.channelName) : '';

	useLayoutEffect(() => {
		Spotlight.focus('record-prompt');
	}, []);

	const nowWhen = [
		`${formatShowingTime(airing.start, clockDisplay)}${airing.end ? ` – ${clock(airing.end)}` : ''}`,
		airing.channel
	].filter(Boolean).join(' · ');
	const laterCardWhen = suggestion && [
		`${formatDayLabel(suggestion.start)} · ${clock(suggestion.start)}`,
		laterChannel
	].filter(Boolean).join(' · ');

	return (
		<div className={css.scrim}>
			<PromptContainer className={css.dialog} spotlightId="record-prompt">
				<div className={css.title}>{$L('Record {name}').replace('{name}', programName)}</div>
				<div className={css.details}>
					<div className={css.started}>
						{plural(
							Math.max(1, elapsedMinutes),
							$L('This showing started 1 minute ago, so the recording will miss the start.'),
							$L('This showing started {minutes} minutes ago, so the recording will miss the start.')
						)}
					</div>
					<ShowingCard
						label={$L('Now')}
						when={nowWhen}
						progress={progress}
						progressLabel={plural(elapsedMinutes, $L('1 min already aired'), $L('{minutes} min already aired'))}
						description={airing.description}
					/>
					{suggestion && (
						<ShowingCard
							label={$L('Future showing')}
							when={laterCardWhen}
							description={(suggestion.description || '').trim()}
							status={suggestion.alreadyScheduled ? $L('Already set to record') : null}
						/>
					)}
				</div>
				{/* The notes and the question sit below the cards rather than with them, so a long
					description can't push a caution about the match off the dialog. */}
				<div className={css.pinned}>
					{uncertain && <PromptNote path={ICONS.warning} caution text={$L("Matched by title and description only. Check it's the same program.")} />}
					{differ && <PromptNote path={ICONS.compare} caution text={$L('The descriptions differ, so this may be a different program.')} />}
					{suggestion && !cautious && airing.season != null && airing.episode != null && (
						<PromptNote
							path={ICONS.check}
							text={$L('Same episode (S{season}E{episode})').replace('{season}', airing.season).replace('{episode}', airing.episode)}
						/>
					)}
					<div className={css.question}>
						{suggestion
							? $L('Also record the future showing to get a complete recording?')
							: $L('Also record a future showing automatically once one is found, to get a complete recording?')}
					</div>
				</div>
				<div className={css.actions}>
					<SpottableButton
						className={`${css.button} ${cautious ? 'spottable-default' : ''}`}
						onClick={() => onChoose(RECORD_CHOICE.now)} // eslint-disable-line react/jsx-no-bind
					>
						{$L('Record Now Only')}
					</SpottableButton>
					<SpottableButton
						className={css.button}
						onClick={() => onChoose(RECORD_CHOICE.later)} // eslint-disable-line react/jsx-no-bind
					>
						{suggestion ? $L('Record {when} Only').replace('{when}', laterWhen) : $L('Record Future Showing Only')}
					</SpottableButton>
					<SpottableButton
						className={`${css.button} ${cautious ? '' : 'spottable-default'}`}
						onClick={() => onChoose(RECORD_CHOICE.both)} // eslint-disable-line react/jsx-no-bind
					>
						{suggestion ? $L('Record Now and {when}').replace('{when}', laterWhen) : $L('Record Now and Future Showing')}
					</SpottableButton>
				</div>
			</PromptContainer>
		</div>
	);
};

// What shows while the plugin looks for a future showing. Back can't leave it, it's over in a
// few seconds at most.
export const RecordPromptLoading = () => (
	<div className={css.scrim}>
		<div className={css.spinner} />
	</div>
);

export default RecordPrompt;
