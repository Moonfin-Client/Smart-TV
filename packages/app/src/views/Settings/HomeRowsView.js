/* eslint-disable react/jsx-no-bind */
import {useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';

import LoadingSpinner from '../../components/LoadingSpinner';
import {isPickedRow, isSeerrSliderRow} from '../../utils/pickedRows';
import {HOME_ROW_GROUPS, homeRowGroup, isHomeRowVisibleByGates, pickedRowLabel} from './homeSectionsModel';
import {ReorderRow, SectionTitle, useCommitOnLeave} from './settingsRows';
import {SettingsGlyph} from './settingsIcons';
import {SpottableDiv} from './settingsSpottables';
import SettingsView, {TitleAction} from './SettingsView';

import css from './Settings.module.less';
import SettingsButton from './SettingsButton';

const groupLabel = (group) => {
	switch (group) {
		case 'collections': return $L('Collections');
		case 'favorites': return $L('Favorites');
		case 'genres': return $L('Genres and Studios');
		case 'playlists': return $L('Playlists');
		case 'seerr': return $L('Seerr');
		case 'external': return $L('External Lists');
		default: return $L('General');
	}
};

// A server can have hundreds of collections, so an open group lists this many at a time
const ROW_RENDER_STEP = 60;

const groupSpotlightId = (group) => `homerows-group-${group}`;
const rowSpotlightId = (item) => `homerow-${item.id}`;
const rowTitle = (item) => (isPickedRow(item) || isSeerrSliderRow(item) ? item.name : $L(item.name));

const GroupRow = ({group, count, open, onToggle}) => (
	<SpottableDiv className={`${css.listItem} ${css.listItemClean}`} onClick={onToggle} spotlightId={groupSpotlightId(group)}>
		<div className={open ? `${css.listItemIconPlain} ${css.groupChevronOpen}` : css.listItemIconPlain}>
			<SettingsGlyph name='chevron_right' />
		</div>
		<div className={css.listItemBody}>
			<div className={css.listItemHeading}>{groupLabel(group)}</div>
		</div>
		<div className={css.listItemTrailing}>
			<div className={css.valueBubble}>{count}</div>
		</div>
	</SpottableDiv>
);

// The Enabled list is what Home shows, in its order, and left and right move a row through it.
// The disabled rows sit below in a group per kind that OK opens and closes. Rows the viewer has
// switched off elsewhere, and the Live TV rows on a server without Live TV, are left out. The
// arrangement is written back when the screen closes.
const HomeRowsView = ({
	settings,
	serverUrl,
	servers,
	tempHomeRows,
	loading,
	serverHasLiveTv,
	onToggleHomeRow,
	onMoveHomeRow,
	onReset,
	onLeave
}) => {
	useCommitOnLeave(onLeave);
	const [openGroups, setOpenGroups] = useState(() => new Set());
	const [renderLimit, setRenderLimit] = useState(ROW_RENDER_STEP);
	const visibleRows = tempHomeRows.filter((row) => isHomeRowVisibleByGates(row, settings, serverHasLiveTv, serverUrl));
	const enabledRows = visibleRows.filter((row) => row.enabled);
	const enabledIds = enabledRows.map(rowSpotlightId);
	const disabled = visibleRows.filter((row) => !row.enabled);
	const groups = HOME_ROW_GROUPS
		.map((group) => ({group, items: disabled.filter((item) => homeRowGroup(item) === group)}))
		.filter(({items}) => items.length > 0);

	const toggleGroup = (group) => setOpenGroups((prev) => {
		const next = new Set(prev);
		if (!next.delete(group)) next.add(group);
		return next;
	});

	// Nothing here can take focus while the lists load. Once they're in, focus goes to the first
	// row, since the screen on its own would land on Reset in the title.
	useEffect(() => {
		if (!loading) Spotlight.focus(document.querySelector(`[data-spotlight-id="homerows-view"] .${css.listContent} .spottable`) || 'homerows-view');
	}, [loading]);

	if (loading) {
		return (
			<SettingsView spotlightId='homerows-view' title={$L('Rows')} clean>
				<div className={css.viewSpinner}><LoadingSpinner /></div>
			</SettingsView>
		);
	}

	const rowSubtitle = (item) => {
		if (isSeerrSliderRow(item)) return $L('Seerr Discovery Rows');
		return isPickedRow(item) ? pickedRowLabel(item, serverUrl, servers) : undefined;
	};

	// The row slides out of the list it was in, so the focus goes to the one taking its place
	const toggleFrom = (ids, item, fallbackId) => {
		const at = ids.indexOf(rowSpotlightId(item));
		onToggleHomeRow(item.id);
		const next = ids[at + 1] || ids[at - 1] || fallbackId;
		window.requestAnimationFrame(() => Spotlight.focus(next));
	};

	const renderEnabled = (list) => list.map((item, index) => (
		<ReorderRow
			key={item.id}
			spotlightId={rowSpotlightId(item)}
			title={rowTitle(item)}
			subtitle={rowSubtitle(item)}
			checkbox
			enabled
			isFirst={index === 0}
			isLast={index === list.length - 1}
			onToggle={() => toggleFrom(enabledIds, item, groupSpotlightId(homeRowGroup(item)))}
			onMove={(direction) => onMoveHomeRow(item.id, direction)}
		/>
	));

	return (
		<SettingsView
			spotlightId='homerows-view'
			title={$L('Rows')}
			clean
			action={<TitleAction icon='restore' label={$L('Reset to defaults')} onClick={onReset} />}
		>
			<SectionTitle>{$L('Enabled')}</SectionTitle>
			{renderEnabled(enabledRows)}
			{groups.length > 0 && <SectionTitle>{$L('Disabled')}</SectionTitle>}
			{groups.map(({group, items}) => {
				const open = openGroups.has(group);
				const shown = open ? items.slice(0, renderLimit) : [];
				const ids = shown.map(rowSpotlightId);
				return [
					<GroupRow key={`group-${group}`} group={group} count={items.length} open={open} onToggle={() => toggleGroup(group)} />,
					...shown.map((item) => (
						<ReorderRow
							key={item.id}
							spotlightId={rowSpotlightId(item)}
							title={rowTitle(item)}
							subtitle={rowSubtitle(item)}
							checkbox
							enabled={false}
							isFirst
							isLast
							onToggle={() => toggleFrom(ids, item, rowSpotlightId(item))}
						/>
					)),
					open && items.length > shown.length && (
						<div key={`more-${group}`} className={css.actionBar}>
							<SettingsButton onClick={() => setRenderLimit((prev) => prev + ROW_RENDER_STEP)} spotlightId={`homerows-more-${group}`}>
								{$L('Show More')} ({items.length - shown.length})
							</SettingsButton>
						</div>
					)
				];
			})}
		</SettingsView>
	);
};

export default HomeRowsView;
