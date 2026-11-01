/* eslint-disable react/jsx-no-bind */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Settings from '../../views/Settings';
import SettingsLivePreview, {keepInView, sceneChipId} from '../../views/Settings/LivePreview/SettingsLivePreview';
import {SearchBar} from '../../views/Settings/BrowseViews';
import {SCENE_BY_KEY, describeRow, sceneOfRow} from '../../views/Settings/LivePreview/previewRows';
import {SETTINGS_SCHEMA, resolve} from '../../views/Settings/settingsSchema';
import {usePreviewPalette} from '../../views/SetupWizard/SetupPreviews';
import {useSettings} from '../../context/SettingsContext';
import {useAuth} from '../../context/AuthContext';
import {ensurePreviewItemsLoaded} from '../../views/SetupWizard/setupPreviewData';
import {isTvKeyboardVisible} from '../TVKeyboard/keyboardBus';

import css from './SettingsPanel.module.less';

const PanelContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const PillContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-selected="true"]'
}, 'div');

const PillItem = Spottable('div');

const CLOSE_MS = 220;
const PILL_ID = 'settings-category-pill';

// Whether any row of the list column's page sits above [active], so Up has somewhere to go
// inside the page before it climbs to the pill.
const hasRowAbove = (column, active) => {
	const page = column.querySelector('[data-spotlight-container]');
	if (!page) return false;
	const top = active.getBoundingClientRect().top;
	return Array.prototype.some.call(page.querySelectorAll('.spottable'), (el) => (
		el !== active && el.offsetParent !== null && el.getBoundingClientRect().bottom <= top + 1
	));
};

// The first row of the list column's page rather than the page container, whose memory of its
// last row can point at the same-named page of the category before.
const firstRowOf = (column) => {
	const page = column.querySelector('[data-spotlight-container]');
	return page && Array.prototype.find.call(page.querySelectorAll('.spottable'), (el) => el.offsetParent !== null);
};

// Settings with its live preview: the categories in a pill across the top, the chosen
// category's screens in a column on the left, and a preview of the screen the focused
// setting changes on the right.
const LiveSettingsLayout = ({closing, onClose, onLibrariesChanged, onRunSetupWizard, onSelectItem, hasLiveTv}) => {
	const {settings} = useSettings();
	const {api} = useAuth();
	const t = usePreviewPalette();
	const categories = useMemo(() => SETTINGS_SCHEMA
		.filter((entry) => !entry.when || entry.when({settings}))
		.map((entry) => ({id: entry.id, label: resolve(entry.label)})), [settings]);
	const [category, setCategory] = useState(() => categories[0].id);
	const [rowId, setRowId] = useState(null);
	const [trying, setTrying] = useState(null);
	const [scene, setScene] = useState('home');
	const [query, setQuery] = useState('');
	const [schema, setSchema] = useState(null);
	const listRef = useRef(null);
	const pillRef = useRef(null);
	const topRef = useRef(null);
	const previewRef = useRef(null);
	// The setting focus was last on, which Left off the first chip and Back return to.
	const lastRowRef = useRef(null);
	const sceneRef = useRef(scene);
	sceneRef.current = scene;

	// Kids Mode coming or going swaps the categories out from under the one that was open.
	useEffect(() => {
		if (!categories.some((c) => c.id === category)) setCategory(categories[0].id);
	}, [categories, category]);

	useEffect(() => {
		const timer = setTimeout(() => Spotlight.focus(PILL_ID), 60);
		return () => clearTimeout(timer);
	}, []);

	// The previews draw the library's own titles.
	useEffect(() => {
		ensurePreviewItemsLoaded(api);
	}, [api]);

	// Down from the pill enters the page, Up from a page's top row climbs to the pill. Run
	// before Spotlight, whose page containers otherwise hold focus at their edges.
	useEffect(() => {
		const handleKeyDown = (ev) => {
			if (ev.keyCode !== 38 && ev.keyCode !== 40) return;
			if (isTvKeyboardVisible()) return;
			const active = document.activeElement;
			const column = listRef.current;
			if (!active || !column) return;
			if (ev.keyCode === 40 && topRef.current && topRef.current.contains(active)) {
				const first = firstRowOf(column);
				if (first) {
					ev.preventDefault();
					ev.stopPropagation();
					Spotlight.focus(first);
				}
				return;
			}
			if (ev.keyCode === 38 && column.contains(active)) {
				if (active.closest('[data-spotlight-id="options-view"]')) return;
				if (hasRowAbove(column, active)) return;
				ev.preventDefault();
				ev.stopPropagation();
				Spotlight.focus(PILL_ID);
			}
		};
		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, []);

	// Right off a setting goes to the scene chips. It's heard after Spotlight, so a row with
	// something to its right still gets there first, and a slider stops the key before it
	// arrives. Pickers keep it, since leaving one would leave its choice half tried.
	useEffect(() => {
		const handleKeyDown = (ev) => {
			if (ev.keyCode !== 39 || isTvKeyboardVisible()) return;
			const active = document.activeElement;
			const column = listRef.current;
			if (!column || active !== ev.target || !column.contains(active) || active.tagName === 'INPUT') return;
			if (active.closest('[data-spotlight-id="options-view"]')) return;
			Spotlight.focus(sceneChipId(sceneRef.current));
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	const returnToList = useCallback(() => {
		const last = lastRowRef.current;
		const column = listRef.current;
		if (last && column && column.contains(last) && Spotlight.focus(last)) return;
		const first = column && firstRowOf(column);
		if (first) Spotlight.focus(first);
	}, []);

	// Back on a chip goes back to the setting rather than out of the screen.
	const handleLiveBack = useCallback(() => {
		if (!previewRef.current || !previewRef.current.contains(document.activeElement)) return false;
		returnToList();
		return true;
	}, [returnToList]);

	// Back at a category's own page returns to the pill, and from the pill closes Settings.
	const handleRootBack = useCallback(() => {
		if (pillRef.current && pillRef.current.contains(document.activeElement)) onClose();
		else Spotlight.focus(PILL_ID);
	}, [onClose]);

	const handleListFocus = useCallback((ev) => {
		const host = ev.target.closest ? ev.target.closest('[data-spotlight-id]') : null;
		const id = host ? host.getAttribute('data-spotlight-id') : null;
		lastRowRef.current = ev.target;
		if (!id || /^opt-\d+$/.test(id)) return;
		const described = describeRow(id, settings, schema);
		if (!described) return;
		setRowId(id);
		const next = sceneOfRow(described);
		if (next) setScene(next);
	}, [settings, schema]);

	// The inspector tells what the category holds while the pill has focus.
	const handlePillFocus = useCallback((id) => {
		setCategory(id);
		setRowId(`cat-${id}`);
	}, []);

	const handleTry = useCallback((key, value, index) => {
		if (key == null) {
			setTrying(null);
			return;
		}
		setTrying({key, value, index});
		if (SCENE_BY_KEY[key]) setScene(SCENE_BY_KEY[key]);
	}, []);

	const row = useMemo(() => describeRow(rowId, settings, schema), [rowId, settings, schema]);

	const handleQueryChange = useCallback((ev) => setQuery(ev.target.value), []);
	const clearQuery = useCallback(() => setQuery(''), []);

	return (
		<div className={closing ? `${css.overlay} ${css.closing}` : css.overlay}>
			<PanelContainer className={css.livePanel} spotlightId='settings-panel-container'>
				<div className={css.liveTop} ref={topRef}>
					<div className={css.liveTitle}>{$L('Settings')}</div>
					<div className={css.pillWrap} ref={pillRef}>
						<PillContainer className={css.pill} spotlightId={PILL_ID}>
							{categories.map((c) => (
								<PillItem
									key={c.id}
									spotlightId={`pill-${c.id}`}
									data-selected={c.id === category}
									className={c.id === category ? `${css.pillItem} ${css.pillItemSelected}` : css.pillItem}
									style={c.id === category ? {backgroundColor: t.accent} : null}
									onFocus={(ev) => {
										keepInView(ev.currentTarget, pillRef.current);
										handlePillFocus(c.id);
									}}
									onClick={() => setCategory(c.id)}
								>
									{c.label}
								</PillItem>
							))}
						</PillContainer>
					</div>
					{!settings.kidsModeEnabled && (
						<div className={css.searchSlot}>
							<SearchBar value={query} onChange={handleQueryChange} />
						</div>
					)}
				</div>
				<div className={css.liveBody}>
					<div className={css.listColumn} ref={listRef} onFocus={handleListFocus}>
						<Settings
							panelMode
							liveCategory={category}
							onRootBack={handleRootBack}
							onLiveBack={handleLiveBack}
							onPreviewTry={handleTry}
							onSchemaContext={setSchema}
							liveSearchQuery={settings.kidsModeEnabled ? '' : query}
							onLiveSearchClear={clearQuery}
							onBack={onClose}
							onLibrariesChanged={onLibrariesChanged}
							onRunSetupWizard={onRunSetupWizard}
							onSelectItem={onSelectItem}
							hasLiveTv={hasLiveTv}
						/>
					</div>
					<div className={css.previewColumn} ref={previewRef}>
						<SettingsLivePreview
							scene={scene}
							row={row}
							trying={trying}
							onPickScene={setScene}
							onLeaveChips={returnToList}
							hasLiveTv={hasLiveTv}
						/>
					</div>
				</div>
			</PanelContainer>
		</div>
	);
};

const SettingsPanel = ({initialView, onClose, onLibrariesChanged, onRunSetupWizard, onSelectItem, hasLiveTv}) => {
	const [closing, setClosing] = useState(false);
	const timerRef = useRef(null);

	useEffect(() => () => clearTimeout(timerRef.current), []);

	const handleClose = useCallback(() => {
		if (timerRef.current) return;
		if (document.documentElement.classList.contains('perf-low')) {
			onClose?.();
			return;
		}
		setClosing(true);
		timerRef.current = setTimeout(() => onClose?.(), CLOSE_MS);
	}, [onClose]);

	// Settings opened straight to one screen keeps the side drawer.
	if (!initialView) {
		return (
			<LiveSettingsLayout
				closing={closing}
				onClose={handleClose}
				onLibrariesChanged={onLibrariesChanged}
				onRunSetupWizard={onRunSetupWizard}
				onSelectItem={onSelectItem}
				hasLiveTv={hasLiveTv}
			/>
		);
	}

	return (
		<div className={closing ? `${css.overlay} ${css.closing}` : css.overlay}>
			<div className={css.scrim} onClick={handleClose} />
			<PanelContainer className={css.panel} spotlightId="settings-panel-container">
				<Settings
					panelMode
					initialView={initialView}
					onBack={handleClose}
					onLibrariesChanged={onLibrariesChanged}
					onRunSetupWizard={onRunSetupWizard}
					onSelectItem={onSelectItem}
					hasLiveTv={hasLiveTv}
				/>
			</PanelContainer>
		</div>
	);
};

export default SettingsPanel;
