import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {watchParty, newPartyRooms} from '../../services/siloWatchParty';
import {getServerUrl} from '../../services/jellyfinApi';
import useWatchPartyRooms from '../../hooks/useWatchPartyRooms';
import {KEYS} from '../../utils/keys';
import {getImageUrl} from '../../utils/helpers';
import {PartyAvatar, PartyIcon, partyTitle} from './partyParts';
import {RoomArt, RoomChips, roomDotColor} from './WatchPartyDialog';

import rowCss from '../MediaRow/MediaRow.module.less';
import css from './WatchPartyDialog.module.less';

const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused', defaultElement: '[data-party-card]'}, 'div');
const SpottableDiv = Spottable('div');

const ALERT_MS = 8000;
// Rooms already seen per login, so an alert is only ever for a party that started while Home was up.
const seenByLogin = new Map();

export const useWatchPartyHomeRow = ({enabled, active, sessionKey, withSyncPlay, alerts}) => {
	const {rooms} = useWatchPartyRooms({active: enabled && active, withSyncPlay});
	const [alert, setAlert] = useState(null);

	useEffect(() => {
		if (!rooms) return;
		const seen = seenByLogin.get(sessionKey);
		const fresh = seen ? newPartyRooms(seen, rooms) : [];
		const known = seen || new Set();
		rooms.forEach((r) => known.add(r.roomId));
		seenByLogin.set(sessionKey, known);
		if (!alerts || fresh.length === 0) return;
		let live = true;
		watchParty.config().then((config) => {
			if (live && config?.alerts !== false) setAlert(fresh[0]);
		});
		return () => {
			live = false;
		};
	}, [rooms, sessionKey, alerts]);

	useEffect(() => {
		if (!alert) return undefined;
		const timer = setTimeout(() => setAlert(null), ALERT_MS);
		return () => clearTimeout(timer);
	}, [alert]);

	const row = useMemo(() => (enabled && rooms?.length
		? {id: 'watch-parties', title: $L('Watch Parties'), type: 'landscape', isWatchPartyRow: true, items: rooms.map((r) => ({...r, Id: r.roomId}))}
		: null), [enabled, rooms]);
	return {row, alert: enabled ? alert : null};
};

const cardLine = (room) => {
	if (room.kind === 'syncplay') return `${room.hostName} · ${room.memberCount}`;
	if (room.phase !== 'playing') return `${room.hostName} · ${$L('In the lobby')}`;
	return `${room.hostName} · ${$L('{count} watching').replace('{count}', String(room.memberCount))}`;
};

const PartyCard = memo(({room, rowId, labels, onJoin}) => {
	const handleClick = useCallback(() => onJoin(room), [onJoin, room]);
	return (
		<SpottableDiv
			className={css.partyCard}
			data-party-card
			spotlightId={`media-${rowId}-${room.Id}`}
			onClick={handleClick}
			aria-label={`${partyTitle(room) || room.hostName}, ${cardLine(room)}`}
		>
			<RoomArt room={room} className={css.partyCardImage} loading="lazy" />
			<RoomChips room={room} labels={labels} className={css.partyCardChips} />
			<span className={css.partyCardState}><span className={css.dot} style={{background: roomDotColor(room)}} />{cardLine(room)}</span>
		</SpottableDiv>
	);
});

const WatchPartyRow = ({title, items, rowIndex, rowId, labels, onFocus, onNavigateUp, onNavigateDown, rowSpacing, registerRowRef, onJoin, onStart}) => {
	const scrollerRef = useRef(null);
	const rowElementRef = useRef(null);

	useEffect(() => {
		registerRowRef?.(rowIndex, rowElementRef.current);
		return () => registerRowRef?.(rowIndex, null);
	}, [rowIndex, registerRowRef]);

	const handleFocus = useCallback((e) => {
		onFocus?.(rowIndex);
		const card = e.target.closest('.spottable');
		const scroller = scrollerRef.current;
		if (!card || !scroller || Spotlight.getPointerMode()) return;
		const cardRect = card.getBoundingClientRect();
		const box = scroller.getBoundingClientRect();
		if (cardRect.left < box.left) scroller.scrollLeft -= box.left - cardRect.left + 50;
		else if (cardRect.right > box.right) scroller.scrollLeft += cardRect.right - box.right + 50;
	}, [rowIndex, onFocus]);

	const handleKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP && onNavigateUp) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateUp(rowIndex);
		} else if (e.keyCode === KEYS.DOWN && onNavigateDown) {
			e.preventDefault();
			e.stopPropagation();
			onNavigateDown(rowIndex);
		}
	}, [rowIndex, onNavigateUp, onNavigateDown]);

	return (
		<RowContainer
			ref={rowElementRef}
			className={rowCss.row}
			spotlightId={`row-${rowIndex}`}
			data-row-index={rowIndex}
			data-row-id={rowId}
			onKeyDown={handleKeyDown}
			style={typeof rowSpacing === 'number' ? {marginBottom: `${rowSpacing}px`} : undefined}
		>
			<h2 className={rowCss.title}>{title}</h2>
			<div className={rowCss.scroller} ref={scrollerRef} onFocus={handleFocus}>
				<div className={rowCss.items}>
					{items.map((room) => (
						<PartyCard key={`${room.kind}-${room.Id}`} room={room} rowId={rowId} labels={labels} onJoin={onJoin} />
					))}
					<SpottableDiv className={`${css.partyCard} ${css.partyStart}`} data-party-card spotlightId={`media-${rowId}-start`} onClick={onStart}>
						<PartyIcon name="plus" className={css.partyStartIcon} />
						<span>{$L('Start a watch party')}</span>
					</SpottableDiv>
				</div>
			</div>
		</RowContainer>
	);
};

export default memo(WatchPartyRow);

export const WatchPartyAlert = memo(({room}) => {
	if (!room) return null;
	const poster = room.selectedContentId ? getImageUrl(getServerUrl(), room.selectedContentId, 'Primary', {maxHeight: 200, quality: 80}) : null;
	const what = partyTitle(room);
	return (
		<div className={css.alert} role="status" key={room.roomId}>
			<div className={css.alertBody}>
				{poster && <img className={css.alertPoster} src={poster} alt="" />}
				<span className={css.alertText}>
					<span className={css.alertHead}>
						<PartyAvatar name={room.hostName} className={css.alertAvatar} />
						<span>{$L('{name} started a watch party').replace('{name}', room.hostName)}</span>
					</span>
					<span className={css.alertLine}>
						{[what, $L('{count} in the lobby').replace('{count}', String(room.memberCount))].filter(Boolean).join(' · ')}
					</span>
					<span className={css.alertNote}>{$L("It's first in Watch Parties on Home")}</span>
				</span>
			</div>
			<span className={css.alertTrack}><span className={css.alertProgress} /></span>
		</div>
	);
});
