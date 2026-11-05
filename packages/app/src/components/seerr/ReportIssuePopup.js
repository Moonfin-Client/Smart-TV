import {memo, useCallback, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';

import CoreDialog, {CoreDialogRow} from '../CoreDialog';
import SpottableInput from '../SpottableInput/SpottableInput';
import {ISSUE_TYPE, getIssueTypeLabel} from '../../utils/seerrStatus';
import {seasonNumbersOf} from '../../utils/seerrRequestRules';
import {SeerrButtonRow, SeerrDialogButton, SeerrDivider, SeerrFocusRow, SeerrSelectorRow} from './SeerrDialogControls';
import {MaterialIcon} from '../icons/materialIcons';

import css from './ReportIssuePopup.module.less';

// Reports a problem with a title back to Seerr, optionally against one season or episode.

const ISSUE_TYPES = [ISSUE_TYPE.VIDEO, ISSUE_TYPE.AUDIO, ISSUE_TYPE.SUBTITLES, ISSUE_TYPE.OTHER];

const seasonLabel = (season) => (season > 0 ? $L('Season {number}').replace('{number}', season) : $L('All Seasons'));
const episodeLabel = (episode) => (episode > 0 ? $L('Episode {number}').replace('{number}', episode) : $L('All Episodes'));

// Mounted only while open, so each report starts from a clean form. Opened from a season or an
// episode, it starts on that one.
const ReportIssueForm = ({isTv, seasons, numberOfSeasons, initialSeason, initialEpisode, onSubmit, onClose}) => {
	const seasonNumbers = useMemo(() => seasonNumbersOf(seasons, numberOfSeasons || 0), [seasons, numberOfSeasons]);
	// The season each picker row stands for, with 0 for all seasons first.
	const seasonValues = useMemo(() => [0, ...seasonNumbers], [seasonNumbers]);

	const [issueType, setIssueType] = useState(ISSUE_TYPE.VIDEO);
	const startsOnSeason = isTv && initialSeason > 0;
	const [season, setSeason] = useState(() => {
		if (startsOnSeason) return initialSeason;
		return isTv && seasonNumbers.length === 1 ? seasonNumbers[0] : 0;
	});
	const [episode, setEpisode] = useState(() => (startsOnSeason && initialEpisode > 0 ? initialEpisode : 0));
	const [message, setMessage] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [picker, setPicker] = useState(null);

	const episodeCount = useMemo(() => {
		if (season <= 0) return 0;
		return (seasons || []).find(s => s.seasonNumber === season)?.episodeCount || 0;
	}, [seasons, season]);

	const handleTypeClick = useCallback((e) => setIssueType(Number(e.currentTarget.dataset.type)), []);
	const handleMessageChange = useCallback((e) => setMessage(e.target.value), []);
	const openSeasonPicker = useCallback(() => setPicker('season'), []);
	const openEpisodePicker = useCallback(() => setPicker('episode'), []);
	const closePicker = useCallback(() => setPicker(null), []);

	const handlePick = useCallback((e) => {
		const index = Number(e.currentTarget.dataset.index);
		if (picker === 'season') {
			setSeason(seasonValues[index]);
			setEpisode(0);
		} else {
			setEpisode(index);
		}
		setPicker(null);
	}, [picker, seasonValues]);

	const handleSubmit = useCallback(async () => {
		const text = message.trim();
		if (!text || submitting) return;
		setSubmitting(true);
		try {
			await onSubmit({
				issueType,
				message: text,
				problemSeason: isTv ? season : 0,
				problemEpisode: isTv && season > 0 ? episode : 0
			});
		} finally {
			setSubmitting(false);
		}
	}, [message, submitting, issueType, isTv, season, episode, onSubmit]);

	const canSend = message.trim().length > 0 && !submitting;

	let pickerLabels = [];
	let pickerSelected = 0;
	if (picker === 'season') {
		pickerLabels = seasonValues.map(seasonLabel);
		pickerSelected = Math.max(0, seasonValues.indexOf(season));
	} else if (picker === 'episode') {
		pickerLabels = Array.from({length: episodeCount + 1}, (_, i) => episodeLabel(i));
		pickerSelected = Math.min(episode, episodeCount);
	}

	return (
		<>
			<CoreDialog
				open
				onClose={onClose}
				title={$L('Report Issue')}
				spotlightId="report-issue"
				bodyClassName={css.body}
			>
				<div className={css.form}>
					{ISSUE_TYPES.map((type) => {
						const selected = issueType === type;
						return (
							<SeerrFocusRow key={type} data-type={type} onClick={handleTypeClick}>
								<MaterialIcon
									name={selected ? 'radioChecked' : 'radioUnchecked'}
									className={`${css.radio} ${selected ? css.radioOn : ''}`}
								/>
								<span className={css.typeLabel}>{getIssueTypeLabel(type)}</span>
							</SeerrFocusRow>
						);
					})}

					{isTv && seasonNumbers.length > 0 && (
						<>
							<SeerrDivider />
							<SeerrSelectorRow
								className={css.seasonRow}
								label={$L('Season')}
								value={seasonLabel(season)}
								onClick={openSeasonPicker}
							/>
							{season > 0 && (
								<SeerrSelectorRow
									className={css.episodeRow}
									label={$L('Episode')}
									value={episodeLabel(episode)}
									onClick={openEpisodePicker}
								/>
							)}
						</>
					)}

					<div className={css.messageLabel}>{$L("What's wrong?")}</div>
					<SpottableInput
						className={css.messageField}
						spotlightId="report-issue-message"
						placeholder={$L("What's wrong?")}
						value={message}
						onChange={handleMessageChange}
					/>

					<SeerrButtonRow className={css.actions}>
						<SeerrDialogButton label={$L('Cancel')} onClick={submitting ? null : onClose} />
						<SeerrDialogButton
							label={$L('Submit Report')}
							primary
							busy={submitting}
							onClick={canSend ? handleSubmit : null}
						/>
					</SeerrButtonRow>
				</div>
			</CoreDialog>

			<CoreDialog
				open={picker !== null}
				onClose={closePicker}
				title={picker === 'season' ? $L('Season') : $L('Episode')}
				showCancel
				spotlightId="report-issue-picker"
			>
				{pickerLabels.map((label, index) => (
					<CoreDialogRow
						key={label}
						label={label}
						selected={index === pickerSelected}
						data-index={index}
						onClick={handlePick}
					/>
				))}
			</CoreDialog>
		</>
	);
};

export const ReportIssuePopup = memo(({open, ...rest}) => (open ? <ReportIssueForm {...rest} /> : null));
