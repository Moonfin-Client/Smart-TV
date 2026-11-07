/* eslint-disable react/jsx-no-bind */
import $L from '@enact/i18n/$L';

import LoadingSpinner from '../../components/LoadingSpinner';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {getRatingSourceOptions, getImageTypeOptions} from './settingsOptions';
import {renderSettingsIcon} from './settingsIcons';
import {ratingIsRanked} from '../../utils/parentalFilter';
import {SpottableDiv} from './settingsSpottables';
import {ReorderRow, SectionTitle, useCommitOnLeave} from './settingsRows';
import SettingsView, {TitleAction} from './SettingsView';

import css from './Settings.module.less';
import SettingsButton from './SettingsButton';

// Screens that edit one value against a scratch copy rather than writing through on every press
// the way a plain settings row does.

// Enabled sources lead in their stored order, since that order is the one the ratings row draws
// them in, and only those move. The list is written back when the screen closes.
export const RatingSourcesView = ({selected, onToggleSource, onMoveSource, onReset, onLeave}) => {
	useCommitOnLeave(onLeave);
	const options = getRatingSourceOptions();
	const byValue = new Map(options.map((option) => [option.value, option]));
	const ordered = [
		...selected.map((value) => byValue.get(value)).filter(Boolean),
		...options.filter((option) => !selected.includes(option.value))
	];
	return (
		<SettingsView
			spotlightId='rating-sources-view'
			title={$L('Ratings')}
			clean
			action={<TitleAction icon='restore' label={$L('Reset to defaults')} onClick={onReset} />}
		>
			<div className={`${css.listItem} ${css.listItemPlain} ${css.listItemStatic}`}>
				{renderSettingsIcon('reorder', false, true)}
				<div className={css.listItemBody}>
					<div className={css.listItemHeading}>{$L('Rating Sources')}</div>
					<div className={css.listItemCaption}>{$L('Enable and reorder the rating sources shown throughout the app')}</div>
				</div>
			</div>
			{ordered.map((option) => {
				const index = selected.indexOf(option.value);
				return (
					<ReorderRow
						key={option.value}
						spotlightId={`rating-source-${option.value}`}
						title={option.label}
						plain
						checkbox
						enabled={index >= 0}
						isFirst={index <= 0}
						isLast={index < 0 || index === selected.length - 1}
						onToggle={() => onToggleSource(option.value)}
						onMove={(delta) => onMoveSource(option.value, delta)}
					/>
				);
			})}
		</SettingsView>
	);
};

const BlockedRatingRow = ({rating, isBlocked, onToggleRating}) => (
	<SpottableDiv
		className={css.listItem}
		onClick={() => onToggleRating(rating)}
		spotlightId={`blocked-rating-${rating}`}
	>
		{renderSettingsIcon(isBlocked ? 'check_box' : 'check_box_outline_blank', false, true)}
		<div className={css.listItemBody}>
			<div className={css.listItemHeading}>{rating}</div>
		</div>
	</SpottableDiv>
);

// Ratings that can't be ranked sit apart, since they only ever block themselves.
export const BlockedRatingsView = ({ratings, blocked, loading, loadFailed, onToggleRating}) => {
	const ranked = ratings.filter(ratingIsRanked);
	const unranked = ratings.filter((rating) => !ratingIsRanked(rating));
	return (
		<SettingsView spotlightId='blocked-ratings-view' title={$L('Parental Controls')} clean>
			<div className={css.editorLead}>{$L('Block content with the following ratings:')}</div>
			<div className={`${css.editorHint} ${css.editorHintClean}`}>{$L('Blocking a rating also blocks everything stronger than it.')}</div>
			{loading && <div className={css.viewSpinner}><LoadingSpinner /></div>}
			{!loading && ratings.length === 0 && (
				<div className={css.viewDescription}>
					{loadFailed
						? $L('Could not load server ratings. Showing saved ratings only.')
						: $L('No content ratings were found on this server yet.')}
				</div>
			)}
			{!loading && ratings.length > 0 && loadFailed && (
				<div className={`${css.statusMessage} ${css.statusError}`}>{$L('Could not refresh ratings from server. Showing saved ratings.')}</div>
			)}
			{!loading && ranked.length > 0 && <SectionTitle>{$L('Ratings')}</SectionTitle>}
			{!loading && ranked.map((rating) => (
				<BlockedRatingRow key={rating} rating={rating} isBlocked={blocked.includes(rating)} onToggleRating={onToggleRating} />
			))}
			{!loading && unranked.length > 0 && <SectionTitle>{$L('Only blocks itself')}</SectionTitle>}
			{!loading && unranked.map((rating) => (
				<BlockedRatingRow key={rating} rating={rating} isBlocked={blocked.includes(rating)} onToggleRating={onToggleRating} />
			))}
		</SettingsView>
	);
};

// One row per enabled home section. Clicking cycles Default and the four
// image types, writing through immediately like the plain settings rows do.
export const RowImageTypesView = ({rows, overrides, globalLabel, onCycleRow}) => (
	<SettingsView spotlightId='row-image-types-view' title={$L('Row Image Types')} clean>
		<div className={css.viewDescription}>
			{$L('Choose the artwork each classic home row uses. Default follows the global Home Rows Image Type.')}
		</div>
		{rows.map((row) => {
			const current = overrides[row.id];
			const currentLabel = current
				? (getImageTypeOptions().find((option) => option.value === current)?.label || current)
				: $L('Default ({global})').replace('{global}', globalLabel);
			return (
				<SpottableDiv
					key={row.id}
					className={css.listItem}
					onClick={() => onCycleRow(row.id)}
					spotlightId={`row-image-type-${row.id}`}
				>
					<div className={css.listItemBody}>
						<div className={css.listItemHeading}>{row.name}</div>
						<div className={css.listItemCaption}>{currentLabel}</div>
					</div>
				</SpottableDiv>
			);
		})}
		{rows.length === 0 && (
			<div className={css.viewDescription}>{$L('No home rows are enabled')}</div>
		)}
	</SettingsView>
);

// Sets a new PIN, or with `verify` asks for the current one before it's changed or removed.
export const PinCodeView = ({pin, error, verify, onPinChange, onCancel, onSave}) => (
	<SettingsView spotlightId='pin-code-view' title={verify ? $L('Enter PIN') : $L('Set PIN Code')} clean>
		<div className={css.viewDescription}>
			{verify ? $L('Enter your 4-digit PIN') : $L('Enter a 4-digit PIN used to unlock the app when PIN protection is enabled.')}
		</div>
		<div className={css.inputGroup}>
			<label>{$L('PIN')}</label>
			<SpottableInput
				className={css.input}
				type='password'
				purpose='numeric'
				value={pin}
				onChange={(e) => onPinChange(String(e.target.value || '').replace(/\D/g, '').slice(0, 4))}
				placeholder={$L('4 digits')}
				maxLength={4}
				spotlightId='pin-code-input'
			/>
		</div>
		{error && <div className={`${css.statusMessage} ${css.statusError}`}>{error}</div>}
		<div className={css.actionBar}>
			<SettingsButton onClick={onCancel} spotlightId='pin-code-cancel'>
				{$L('Cancel')}
			</SettingsButton>
			<SettingsButton primary onClick={onSave} spotlightId='pin-code-save'>
				{verify ? $L('Continue') : $L('Save')}
			</SettingsButton>
		</div>
	</SettingsView>
);
