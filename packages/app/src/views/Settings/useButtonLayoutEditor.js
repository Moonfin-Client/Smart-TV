import {useCallback, useState} from 'react';

import {
	ordered, hiddenSet, withUnknownIds, DETAIL_BUTTONS, OSD_BUTTONS,
	DETAIL_ORDER_KEY, DETAIL_HIDDEN_KEY, OSD_ORDER_KEY, OSD_HIDDEN_KEY
} from '../../utils/buttonLayout';
import {
	DETAIL_METADATA, DETAIL_METADATA_ORDER_KEY, DETAIL_METADATA_HIDDEN_KEY
} from '../../utils/detailMetadataLayout';

// The details row, the player controls, and the details metadata row are arranged the same way,
// so one view drives all three and only the storage keys and catalogue differ.
const buttonLayoutKeys = (kind) => {
	if (kind === 'osd') {
		return {catalogue: OSD_BUTTONS, orderKey: OSD_ORDER_KEY, hiddenKey: OSD_HIDDEN_KEY};
	}
	if (kind === 'metadata') {
		return {catalogue: DETAIL_METADATA, orderKey: DETAIL_METADATA_ORDER_KEY, hiddenKey: DETAIL_METADATA_HIDDEN_KEY};
	}
	return {catalogue: DETAIL_BUTTONS, orderKey: DETAIL_ORDER_KEY, hiddenKey: DETAIL_HIDDEN_KEY};
};

const returnFocusMap = {
	osd: 'setting-osdButtons',
	detail: 'setting-detailButtons',
	metadata: 'setting-detailMetadata'
};

// Edits go to a scratch copy, so backing out of the screen leaves the stored arrangement alone.
const useButtonLayoutEditor = ({settings, updateSettings, pushView, popView}) => {
	const [tempButtons, setTempButtons] = useState([]);
	const [buttonLayoutKind, setButtonLayoutKind] = useState('detail');

	const openButtonLayout = useCallback((kind) => {
		const {catalogue, orderKey, hiddenKey} = buttonLayoutKeys(kind);
		const off = hiddenSet(settings[hiddenKey]);
		setButtonLayoutKind(kind);
		setTempButtons(ordered(catalogue, settings[orderKey]).map((btn) => ({...btn, enabled: !off.has(btn.id)})));
		pushView({view: 'buttonLayout', returnFocusTo: returnFocusMap[kind] || 'setting-detailButtons'});
	}, [settings, pushView]);

	const openDetailButtons = useCallback(() => openButtonLayout('detail'), [openButtonLayout]);
	const openOsdButtons = useCallback(() => openButtonLayout('osd'), [openButtonLayout]);
	const openDetailMetadata = useCallback(() => openButtonLayout('metadata'), [openButtonLayout]);

	const saveButtonLayout = useCallback(() => {
		const {catalogue, orderKey, hiddenKey} = buttonLayoutKeys(buttonLayoutKind);
		const merged = withUnknownIds(
			catalogue,
			{
				order: tempButtons.map((btn) => btn.id),
				hidden: tempButtons.filter((btn) => !btn.enabled).map((btn) => btn.id)
			},
			{order: settings[orderKey], hidden: settings[hiddenKey]}
		);
		updateSettings({[orderKey]: merged.order, [hiddenKey]: merged.hidden});
		popView();
	}, [buttonLayoutKind, tempButtons, settings, updateSettings, popView]);

	const resetButtonLayout = useCallback(() => {
		setTempButtons(buttonLayoutKeys(buttonLayoutKind).catalogue.map((btn) => ({...btn, enabled: true})));
	}, [buttonLayoutKind]);

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
		saveButtonLayout,
		resetButtonLayout,
		toggleLayoutButton,
		moveLayoutButton
	};
};

export default useButtonLayoutEditor;
