import {useState, useEffect, useCallback} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import $L from '@enact/i18n/$L';
import {isBackKey} from '../../utils/keys';
import SpottableInput from '../SpottableInput/SpottableInput';
import {isTvKeyboardVisible} from '../TVKeyboard/keyboardBus';

import css from './IdentifyModal.module.less';

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const RESULT_LIMIT = 20;

// Admin actions for a single item: look it up again with the metadata providers when the
// server matched the wrong thing, or just make it re-read what the providers already have.
const IdentifyModal = ({open, item, api, onClose, onApplied, onSuccess}) => {
	const [view, setView] = useState('menu');
	const [name, setName] = useState('');
	const [year, setYear] = useState('');
	const [results, setResults] = useState([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (!open) return;
		setView('menu');
		setResults([]);
		setError(null);
		setBusy(false);
		setName(item?.Name || '');
		setYear(item?.ProductionYear != null ? String(item.ProductionYear) : '');
	}, [open, item]);

	// The search view puts focus in the name field itself, so leave it alone there.
	useEffect(() => {
		if (!open || view === 'search') return undefined;
		const t = setTimeout(() => Spotlight.focus('identify-modal'), 100);
		return () => clearTimeout(t);
	}, [open, view]);

	useEffect(() => {
		if (view === 'search') {
			const t = setTimeout(() => Spotlight.focus('identify-name-input'), 100);
			return () => clearTimeout(t);
		}
		return undefined;
	}, [view]);

	useEffect(() => {
		if (!open) return undefined;
		const handleKey = (e) => {
			if (isTvKeyboardVisible()) return;
			if (!isBackKey(e)) return;
			e.preventDefault();
			e.stopPropagation();
			if (view === 'menu') {
				onClose?.();
			} else {
				setView('menu');
			}
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [open, view, onClose]);

	const handleSearch = useCallback(async () => {
		if (busy) return;
		setBusy(true);
		setError(null);
		try {
			const searchInfo = {
				// Silo searches matches for a given item; Jellyfin ignores it here.
				ItemId: item.Id,
				Name: name.trim(),
				ProviderIds: {},
				...(year.trim() ? {Year: parseInt(year, 10)} : {})
			};
			const found = await api.searchRemote(item.Type, searchInfo);
			setResults((found || []).slice(0, RESULT_LIMIT));
			setView('results');
		} catch {
			setError($L('Could not search for matches.'));
		} finally {
			setBusy(false);
		}
	}, [api, item, name, year, busy]);

	const handleApply = useCallback(async (index) => {
		const result = results[index];
		if (!result || busy) return;
		setBusy(true);
		setError(null);
		try {
			// Silo gives a newly matched item a new id, and the page reopens under it.
			const newId = await api.applyRemoteSearchResult(item.Id, result, true);
			onSuccess?.($L('Metadata updated'));
			onApplied?.(typeof newId === 'string' && newId && newId !== item.Id ? newId : null);
			onClose?.();
		} catch {
			setError($L('Could not apply that match.'));
			setBusy(false);
		}
	}, [api, item, results, busy, onApplied, onClose, onSuccess]);

	const handleResultClick = useCallback((ev) => {
		handleApply(Number(ev.currentTarget.dataset.resultIndex));
	}, [handleApply]);

	const handleRefresh = useCallback(async () => {
		if (busy) return;
		setBusy(true);
		setError(null);
		try {
			await api.refreshItem(item.Id, {replaceAllMetadata: true, replaceAllImages: false});
			onSuccess?.($L('Refreshing metadata'));
			onApplied?.();
			onClose?.();
		} catch {
			setError($L('Could not refresh metadata.'));
			setBusy(false);
		}
	}, [api, item, busy, onApplied, onClose, onSuccess]);

	const handleStartSearch = useCallback(() => setView('search'), []);
	const handleBackToMenu = useCallback(() => setView('menu'), []);
	const handleNameChange = useCallback((ev) => setName(ev.target.value), []);
	const handleYearChange = useCallback((ev) => setYear(ev.target.value), []);

	const handleInputKeyDown = useCallback((ev) => {
		if (ev.keyCode === 13) {
			ev.preventDefault();
			handleSearch();
		} else if (isBackKey(ev)) {
			ev.preventDefault();
			ev.stopPropagation();
			setView('menu');
		}
		ev.stopPropagation();
	}, [handleSearch]);

	if (!open || !item) return null;

	const title = view === 'menu' ? $L('Admin Controls') : $L('Identify');

	return (
		<div className={css.overlay}>
			<DialogContainer className={css.dialog} spotlightId="identify-modal">
				<h2 className={css.title}>{title}</h2>

				{error && <p className={css.error}>{error}</p>}

				{view === 'menu' && (
					<>
						<SpottableDiv className={css.row} onClick={handleStartSearch} spotlightId="identify-start">
							<span className={css.rowLabel}>{$L('Identify')}</span>
							<span className={css.rowDetail}>{$L('Search the metadata providers for a better match')}</span>
						</SpottableDiv>
						<SpottableDiv className={css.row} onClick={handleRefresh}>
							<span className={css.rowLabel}>{busy ? $L('Refreshing...') : $L('Refresh Metadata')}</span>
							<span className={css.rowDetail}>{$L('Re-read the metadata the providers already have')}</span>
						</SpottableDiv>
					</>
				)}

				{view === 'search' && (
					<div className={css.form}>
						<SpottableInput
							spotlightId="identify-name-input"
							className={css.input}
							type="text"
							placeholder={$L('Name')}
							value={name}
							onChange={handleNameChange}
							onKeyDown={handleInputKeyDown}
							maxLength={200}
						/>
						<SpottableInput
							spotlightId="identify-year-input"
							className={css.input}
							type="text"
							purpose="numeric"
							placeholder={$L('Year')}
							value={year}
							onChange={handleYearChange}
							onKeyDown={handleInputKeyDown}
							maxLength={4}
						/>
						<div className={css.formButtons}>
							<SpottableButton
								className={`${css.btn} ${css.btnPrimary}`}
								onClick={handleSearch}
								spotlightId="identify-search"
								disabled={!name.trim() || busy}
							>
								{busy ? $L('Searching...') : $L('Search')}
							</SpottableButton>
							<SpottableButton className={css.btn} onClick={handleBackToMenu}>
								{$L('Cancel')}
							</SpottableButton>
						</div>
					</div>
				)}

				{view === 'results' && (
					<>
						{results.length === 0 && <p className={css.message}>{$L('No matches found')}</p>}
						{results.map((result, index) => (
							<SpottableDiv
								key={`${result.Name}-${index}`}
								className={css.row}
								data-result-index={index}
								onClick={handleResultClick}
								spotlightId={index === 0 ? 'identify-first-result' : undefined}
							>
								<span className={css.rowLabel}>{result.Name || $L('Unknown')}</span>
								<span className={css.rowDetail}>
									{[result.ProductionYear, result.SearchProviderName].filter(Boolean).join(' · ')}
								</span>
							</SpottableDiv>
						))}
						<div className={css.formButtons}>
							<SpottableButton className={css.btn} onClick={handleBackToMenu}>
								{$L('Back')}
							</SpottableButton>
						</div>
					</>
				)}

				{busy && view === 'results' && <p className={css.message}>{$L('Applying…')}</p>}
			</DialogContainer>
		</div>
	);
};

export default IdentifyModal;
