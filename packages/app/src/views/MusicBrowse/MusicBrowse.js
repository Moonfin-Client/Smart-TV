import {useState, useCallback, useMemo, useEffect, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import MediaRow from '../../components/MediaRow';
import LoadingSpinner from '../../components/LoadingSpinner';
import {useSettings} from '../../context/SettingsContext';
import MusicHero from './MusicHero';
import MusicChips from './MusicChips';
import MusicFilterPanel from './MusicFilterPanel';
import useMusicBrowseRows from './useMusicBrowseRows';
import useMusicBrowseFocus from './useMusicBrowseFocus';
import {
	buildMusicChain, clampMusicNode, handleMusicFocusKey,
	MUSIC_FOCUS_IDS, HEADER, HERO, CHIPS
} from './musicFocus';

import css from './MusicBrowse.module.less';

const SpottableButton = Spottable('div');
const HeaderContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');

const IconHome = () => (
	<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>
);
const IconFilter = () => (
	<svg viewBox="0 -960 960 960" fill="currentColor" width="24" height="24"><path d="M440-160q-17 0-28.5-11.5T400-200v-240L168-736q-15-20-4.5-42t36.5-22h560q26 0 36.5 22t-4.5 42L560-440v240q0 17-11.5 28.5T520-160h-80Z" /></svg>
);

// Where a row's See All goes. Last Played has nowhere of its own to send you,
// so it gets no tile.
const SEE_ALL_TARGET = {
	latestMusic: 'albums',
	favorites: 'favorites',
	playlists: 'playlists',
	albumArtists: 'albumArtists',
	artists: 'artists',
	albums: 'albums'
};

// The subtitle each card type earns: who made it, or how much is in it.
const subtitleFor = (item) => {
	if (!item) return '';
	switch (item.Type) {
		case 'Audio':
		case 'MusicAlbum': {
			if (item.Artists?.length) return item.Artists.join(', ');
			const names = (item.AlbumArtists || []).map((a) => a.Name).filter(Boolean);
			if (names.length) return names.join(', ');
			return item.AlbumArtist || '';
		}
		case 'Playlist': {
			const count = item.ChildCount;
			return count > 0 ? $L('{count} items').replace('{count}', String(count)) : '';
		}
		case 'MusicArtist':
		case 'AlbumArtist': {
			const count = item.RecursiveItemCount;
			return count > 0 ? $L('{count} albums').replace('{count}', String(count)) : '';
		}
		default:
			return '';
	}
};

const MusicBrowse = ({library, api, serverUrl, onSelectItem, onOpenGrid, onHome, backHandlerRef}) => {
	const {settings, updateSetting} = useSettings();
	const [showFilter, setShowFilter] = useState(false);
	const showFilterRef = useRef(false);
	showFilterRef.current = showFilter;
	const initialFocusRef = useRef(false);

	const {rows, isLoading, featured} = useMusicBrowseRows({api, library, settings});

	const chain = useMemo(
		() => buildMusicChain({hasHero: Boolean(featured), rowCount: rows.length}),
		[featured, rows.length]
	);

	const {
		scrollerRef, chainRef, lastNodeRef, registerRowRef, registerNode,
		focusNode, handleRowNavigateUp, handleRowNavigateDown, handleRowFocus
	} = useMusicBrowseFocus(chain);

	const handleChainKey = useCallback((node) => (e) => (
		handleMusicFocusKey(e, {node, chain: chainRef.current, focusNode})
	), [chainRef, focusNode]);

	const handleHeaderKey = useMemo(() => handleChainKey(HEADER), [handleChainKey]);
	const handleHeroKey = useMemo(() => handleChainKey(HERO), [handleChainKey]);
	const handleChipsKey = useMemo(() => handleChainKey(CHIPS), [handleChainKey]);

	const handleSeeAll = useCallback((e) => {
		const target = SEE_ALL_TARGET[e.currentTarget?.dataset?.rowId];
		if (target) onOpenGrid(target);
	}, [onOpenGrid]);

	const openFilter = useCallback(() => setShowFilter(true), []);

	const closeFilter = useCallback(() => {
		setShowFilter(false);
		// The header remembers the filter button that opened this, and landing there
		// also keeps focus clear of any row the settings change is about to remove.
		focusNode(HEADER);
	}, [focusNode]);

	useEffect(() => {
		if (!showFilter) return undefined;
		let attempts = 0;
		let raf = null;
		const tryFocus = () => {
			if (Spotlight.focus('music-sort-option-0')) return;
			attempts += 1;
			if (attempts < 6) raf = window.requestAnimationFrame(tryFocus);
		};
		raf = window.requestAnimationFrame(tryFocus);
		return () => { if (raf) window.cancelAnimationFrame(raf); };
	}, [showFilter]);

	useEffect(() => {
		if (!backHandlerRef) return undefined;
		const handler = () => {
			if (showFilterRef.current) {
				closeFilter();
				return true;
			}
			return false;
		};
		backHandlerRef.current = handler;
		// Only give the slot back if it's still ours, so a late unmount elsewhere
		// can't silently kill Back.
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, closeFilter]);

	// First focus once there is something to focus, then a backstop for reloads
	// that pull the focused row out from under us.
	useEffect(() => {
		if (isLoading || showFilter) return;
		if (!initialFocusRef.current) {
			initialFocusRef.current = true;
			focusNode(featured ? HERO : CHIPS);
			return;
		}
		const active = document.activeElement;
		if (active && active !== document.body && active.classList?.contains('spottable')) return;
		focusNode(clampMusicNode(chain, lastNodeRef.current || CHIPS));
	}, [isLoading, showFilter, rows, chain, featured, focusNode, lastNodeRef]);

	return (
		<div className={css.page}>
			<HeaderContainer
				className={css.header}
				spotlightId={MUSIC_FOCUS_IDS[HEADER]}
				onKeyDown={handleHeaderKey}
			>
				<SpottableButton className={css.headerBtn} spotlightId={MUSIC_FOCUS_IDS.home} onClick={onHome}>
					<IconHome />
				</SpottableButton>
				<div className={css.title}>{library?.Name || $L('Music')}</div>
				<SpottableButton className={css.headerBtn} spotlightId={MUSIC_FOCUS_IDS.filter} onClick={openFilter}>
					<IconFilter />
				</SpottableButton>
			</HeaderContainer>

			<div className={css.scroller} ref={scrollerRef}>
				{isLoading ? (
					<div className={css.loading}><LoadingSpinner /></div>
				) : (
					<>
						{featured && (
							<MusicHero
								item={featured}
								subtitle={subtitleFor(featured)}
								serverUrl={serverUrl}
								onSelect={onSelectItem}
								onKeyDown={handleHeroKey}
								registerNode={registerNode}
							/>
						)}

						<MusicChips
							onSelect={onOpenGrid}
							onKeyDown={handleChipsKey}
							registerNode={registerNode}
						/>

						{rows.length === 0 ? (
							<div className={css.empty}>{$L('No music items found')}</div>
						) : rows.map((row, index) => (
							<MediaRow
								key={row.id}
								title={row.title}
								items={row.items}
								serverUrl={serverUrl}
								cardType={row.cardType}
								onSelectItem={onSelectItem}
								rowIndex={index}
								rowId={row.id}
								onFocus={handleRowFocus}
								onNavigateUp={handleRowNavigateUp}
								onNavigateDown={handleRowNavigateDown}
								registerRowRef={registerRowRef}
								onSeeAll={SEE_ALL_TARGET[row.id] ? handleSeeAll : null}
								seeAllLabel={$L('See All')}
							/>
						))}
					</>
				)}
			</div>

			{showFilter && (
				<MusicFilterPanel
					settings={settings}
					onUpdateSetting={updateSetting}
					onClose={closeFilter}
				/>
			)}
		</div>
	);
};

export default MusicBrowse;
