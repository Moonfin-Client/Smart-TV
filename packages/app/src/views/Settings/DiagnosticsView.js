/* eslint-disable react/jsx-no-bind */
import $L from '@enact/i18n/$L';
import Button from '@enact/sandstone/Button';

import {LOG_FILTERS, logLevelColor} from './useDiagnosticsLog';
import {SectionTitle} from './settingsRows';
import {SpottableButton} from './settingsSpottables';
import SettingsView from './SettingsView';

import css from './Settings.module.less';

// Newest first, which is the order anyone reading a log after something went wrong wants.
const DiagnosticsView = ({
	loggingEnabled,
	logEntries,
	logFilter,
	onFilterChange,
	logRenderLimit,
	onShowMore,
	logMessage,
	sendingReport,
	sendUnavailableReason,
	onClearLogs,
	onSendReport
}) => {
	const entries = logEntries
		.filter((entry) => logFilter === 'all' || entry.category === logFilter)
		.reverse();
	const shown = entries.slice(0, logRenderLimit);

	return (
		<SettingsView spotlightId='diagnostics-view'>
			<SectionTitle>{$L('Logs')}</SectionTitle>
			<div className={css.viewDescription}>
				{$L('Server requests recorded on this device. Video and image traffic is not included.')}
			</div>
			<div className={css.logFilterBar}>
				{LOG_FILTERS.map((filter) => (
					<SpottableButton
						key={filter.id}
						className={`${css.logFilter} ${logFilter === filter.id ? css.logFilterOn : ''}`}
						onClick={() => onFilterChange(filter.id)}
						spotlightId={`logfilter-${filter.id}`}
					>
						{$L(filter.label)}
					</SpottableButton>
				))}
			</div>
			{entries.length === 0 && (
				<div className={css.logEmpty}>
					{loggingEnabled
						? $L('Nothing recorded yet.')
						: $L('Turn on Diagnostic Logging to start recording.')}
				</div>
			)}
			<div className={css.logList}>
				{shown.map((entry, index) => (
					<div
						key={`${entry.timestamp}-${index}`}
						className={css.logRow}
						style={{borderLeftColor: logLevelColor(entry.level)}}
					>
						<div className={css.logMeta}>
							<div className={css.logTime}>{entry.timestamp.slice(11, 23)}</div>
							<div className={css.logCategory}>{entry.category}</div>
						</div>
						<div className={css.logMessage}>{entry.message}</div>
					</div>
				))}
			</div>
			{entries.length > logRenderLimit && (
				<div className={css.actionBar}>
					<Button
						onClick={onShowMore}
						size='small'
						spotlightId='log-show-more'
					>
						{$L('Show More')} ({entries.length - logRenderLimit})
					</Button>
				</div>
			)}
			{sendUnavailableReason && <div className={css.viewDescription}>{sendUnavailableReason}</div>}
			{/* Next to the buttons, since a long log leaves the top of the screen far out of view. */}
			{logMessage && <div className={css.statusMessage}>{logMessage}</div>}
			<div className={css.actionBar}>
				<Button onClick={onClearLogs} size='small' spotlightId='log-clear'>
					{$L('Clear')}
				</Button>
				<Button onClick={onSendReport} size='small' disabled={sendingReport || Boolean(sendUnavailableReason)} spotlightId='log-send'>
					{sendingReport ? $L('Sending...') : $L('Send Report')}
				</Button>
			</div>
		</SettingsView>
	);
};

export default DiagnosticsView;
