import {useCallback, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

import serverLogger from '../../services/serverLogger';

const LOG_CATEGORIES = serverLogger.LOG_CATEGORIES;
const LOG_LEVELS = serverLogger.LOG_LEVELS;

export const LOG_FILTERS = [
	{id: 'all', label: 'All'},
	{id: LOG_CATEGORIES.NETWORK, label: 'Network'},
	{id: LOG_CATEGORIES.PLAYBACK, label: 'Playback'},
	{id: LOG_CATEGORIES.SYNCPLAY, label: 'SyncPlay'},
	{id: LOG_CATEGORIES.APP, label: 'Application'},
	{id: LOG_CATEGORIES.AUTHENTICATION, label: 'Auth'},
	{id: LOG_CATEGORIES.NAVIGATION, label: 'Navigation'}
];

// A full buffer is hundreds of spottable rows, which is more than these sets will draw
// without the screen itself becoming the slow thing.
export const LOG_RENDER_STEP = 50;

// Fixed colors rather than theme tokens, since custom properties never survive
// the build for the older sets and a log readout reads fine in any theme.
export const logLevelColor = (level) => {
	if (level === LOG_LEVELS.ERROR || level === LOG_LEVELS.FATAL) return '#ff6b6b';
	if (level === LOG_LEVELS.WARNING) return '#ffd166';
	return '#fff';
};

const useDiagnosticsLog = ({currentViewName, pushView}) => {
	const [logEntries, setLogEntries] = useState([]);
	const [logFilter, setLogFilter] = useState('all');
	const [logRenderLimit, setLogRenderLimit] = useState(LOG_RENDER_STEP);
	const [logMessage, setLogMessage] = useState('');
	const [sendingReport, setSendingReport] = useState(false);

	const openDiagnostics = useCallback(() => {
		setLogEntries(serverLogger.getBuffer());
		setLogFilter('all');
		setLogRenderLimit(LOG_RENDER_STEP);
		setLogMessage('');
		pushView({view: 'diagnostics', returnFocusTo: 'setting-diagnostics'});
	}, [pushView]);

	// Entries arrive while the screen is open, so follow the logger rather than polling it.
	useEffect(() => {
		if (currentViewName !== 'diagnostics') return undefined;
		return serverLogger.subscribe(() => setLogEntries(serverLogger.getBuffer()));
	}, [currentViewName]);

	const handleClearLogs = useCallback(() => {
		serverLogger.clear();
		setLogMessage($L('Logs cleared'));
	}, []);

	const handleSendReport = useCallback(async () => {
		setSendingReport(true);
		setLogMessage('');
		try {
			await serverLogger.uploadReport();
			setLogMessage($L('Report sent to the server'));
		} catch (err) {
			setLogMessage(err?.status === 403
				? $L('The server is not accepting client logs. Enable them in the server dashboard.')
				: $L('Could not send the report.'));
		} finally {
			setSendingReport(false);
		}
	}, []);

	return {
		logEntries,
		logFilter,
		setLogFilter,
		logRenderLimit,
		setLogRenderLimit,
		logMessage,
		sendingReport,
		openDiagnostics,
		handleClearLogs,
		handleSendReport
	};
};

export default useDiagnosticsLog;
