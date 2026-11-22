import {useCallback, useRef, useState} from 'react';

import {
	ordered, hiddenSet, withUnknownIds, DETAIL_BUTTONS, OSD_BUTTONS,
	DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY, OSD_ORDER_KEY, OSD_HIDDEN_KEY
} from '../../utils/buttonLayout';
import {
	DETAIL_METADATA, DETAIL_METADATA_ORDER_KEY, DETAIL_METADATA_HIDDEN_KEY
} from '../../utils/detailMetadataLayout';
import {editedListKey} from './settingsRows';
import {canKeepAsComplete} from '../../services/incompleteRecordings';

// The details row, the player controls, and the details metadata row are arranged the same way,
// so one view drives all three and only the storage keys and catalogue differ.
const buttonLayoutKeys = (kind, hasLiveTv) => {
	if (kind === 'osd') {
		return {catalogue: OSD_BUTTONS, orderKey: OSD_ORDER_KEY, hiddenKey: OSD_HIDDEN_KEY};
	}
	if (kind === 'metadata') {
		return {catalogue: DETAIL_METADATA, orderKey: DETAIL_METADATA_ORDER_KEY, hiddenKey: DETAIL_METADATA_HIDDEN_KEY};
	}
	// Keep as Complete is only offered when the server has Live TV, its plugin tracks incomplete
	// recordings and the user can manage them. A save still keeps its place, since ids outside the
	// catalogue are carried through.
	const catalogue = canKeepAsComplete() && hasLiveTv ? DETAIL_BUTTONS : DETAIL_BUTTONS.filter((item) => item.id !== 'keepAsComplete');
	return {catalogue, orderKey: DETAIL_ORDER_KEY, hiddenKey: DETAIL_HIDDEN_KEY};
};

const returnFocusMap = {
	osd: 'setting-osdButtons',
	detail: 'setting-detailButtons',
	metadata: 'setting-detailMetadata'
};

// Edits go to a scratch copy that's written back once the screen closes, and only if it ended up
// different, so stepping through the list doesn't redraw the screens that read it at every press.
const useButtonLayoutEditor = ({settings, updateSettings, pushView, hasLiveTv}) => {
	const [tempButtons, setTempButtons] = useState([]);
	const [buttonLayoutKind, setButtonLayoutKind] = useState('detail');
	const openedRef = useRef('');

	const openButtonLayout = useCallback((kind) => {
		const {catalogue, orderKey, hiddenKey} = buttonLayoutKeys(kind, hasLiveTv);
		const off = hiddenSet(settings[hiddenKey]);
		const buttons = ordered(catalogue, settings[orderKey]).map((btn) => ({...btn, enabled: !off.has(btn.id)}));
		openedRef.current = editedListKey(buttons);
		setButtonLayoutKind(kind);
		setTempButtons(buttons);
		pushView({view: 'buttonLayout', returnFocusTo: returnFocusMap[kind] || 'setting-detailButtons'});
	}, [settings, pushView, hasLiveTv]);

	const openDetailButtons = useCallback(() => openButtonLayout('detail'), [openButtonLayout]);
	const openOsdButtons = useCallback(() => openButtonLayout('osd'), [openButtonLayout]);
	const openDetailMetadata = useCallback(() => openButtonLayout('metadata'), [openButtonLayout]);

	const commitButtonLayout = useCallback(() => {
		if (editedListKey(tempButtons) === openedRef.current) return;
		openedRef.current = editedListKey(tempButtons);
		const {catalogue, orderKey, hiddenKey} = buttonLayoutKeys(buttonLayoutKind, hasLiveTv);
		const merged = withUnknownIds(
			catalogue,
			{
				order: tempButtons.map((btn) => btn.id),
				hidden: tempButtons.filter((btn) => !btn.enabled).map((btn) => btn.id)
			},
			{order: settings[orderKey], hidden: settings[hiddenKey]}
		);
		updateSettings({[orderKey]: merged.order, [hiddenKey]: merged.hidden});
	}, [buttonLayoutKind, tempButtons, settings, updateSettings, hasLiveTv]);

	const resetButtonLayout = useCallback(() => {
		setTempButtons(buttonLayoutKeys(buttonLayoutKind, hasLiveTv).catalogue.map((btn) => ({...btn, enabled: true})));
	}, [buttonLayoutKind, hasLiveTv]);

	const toggleLayoutButton = useCallback((id) => {
		setTempButtons((prev) => prev.map((btn) => (btn.id === id ? {...btn, enabled: !btn.enabled} : btn)));
	}, []);

	const moveLayoutButton = useCallback((id, delta) => {
		setTempButtons((prev) => {
			const index = prev.findIndex((btn) => btn.id === id);
			const target = index + delta;
			if (index < 0 || target < 0 || target >= prev.length) return prev;
			const next = [...prev];
			next[index] = prev[target];
			next[target] = prev[index];
			return next;
		});
	}, []);

	return {
		tempButtons,
		buttonLayoutKind,
		openDetailButtons,
		openOsdButtons,
		openDetailMetadata,
		commitButtonLayout,
		resetButtonLayout,
		toggleLayoutButton,
		moveLayoutButton
	};
};

export default useButtonLayoutEditor;
