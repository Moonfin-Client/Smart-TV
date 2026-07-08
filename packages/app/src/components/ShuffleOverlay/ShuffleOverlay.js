import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {useSettings} from '../../context/SettingsContext';
import {isBackKey, KEYS} from '../../utils/keys';
import {fetchShuffleGenres, fetchShuffleLibraries, fetchRandomItems} from '../../services/shuffleOverlayService';
import {getTokenParam} from '../../services/jellyfinApi';
import RatingsRow from '../RatingsRow';

import css from './ShuffleOverlay.module.less';

/* eslint-disable react/jsx-no-bind */

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const PickerContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const SpottableButton = Spottable('button');

const buildItemImageUrl = (item, fallbackServerUrl, fallbackAccessToken) => {
	const serverUrl = item?._serverUrl || fallbackServerUrl;
	const accessToken = item?._serverAccessToken || fallbackAccessToken;
	if (!serverUrl || !item?.Id) return '';

	const primaryTag = item.ImageTags?.Primary;
	const seriesTag = item.SeriesPrimaryImageTag;
	const parentTag = item.ParentThumbImageTag;
	const tag = primaryTag || seriesTag || parentTag || '';
	const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : '';
	const tokenParam = accessToken ? `&${getTokenParam(item._serverType)}=${encodeURIComponent(accessToken)}` : '';

	return `${serverUrl}/Items/${item.Id}/Images/Primary?fillWidth=320&fillHeight=480&quality=80${tagParam}${tokenParam}`;
};

const formatRuntime = (ticks) => {
	if (!ticks) return '';
	const totalMinutes = Math.floor(Number(ticks) / 600000000);
	if (!totalMinutes) return '';
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
};

const getFocusList = (items) => {
	const cardIds = items.map((_, index) => `shuffle-card-${index}`);
	return [
		...cardIds,
		'shuffle-action-library',
		'shuffle-action-random',
		'shuffle-action-genres'
	];
};

const PickerDialog = ({open, title, items, loading, emptyLabel, onClose, onPick}) => {
	const overlayClassName = `${css.pickerOverlay} ${open ? css.pickerOverlayOpen : css.pickerOverlayHidden}`;
	const dialogClassName = `${css.pickerDialog} ${open ? css.pickerDialogOpen : css.pickerDialogClosed}`;

	return (
		<div aria-hidden={!open} className={overlayClassName}>
			<PickerContainer className={dialogClassName} spotlightDisabled={!open} spotlightId="shuffle-picker-dialog">
				<h3 className={css.pickerTitle}>{title}</h3>
				{loading ? (
					<div className={css.pickerLoading}>{$L('Loading...')}</div>
				) : items.length === 0 ? (
					<div className={css.pickerEmpty}>{emptyLabel}</div>
				) : (
					<div className={css.pickerList}>
						{items.map((item, index) => {
							const id = item?.Id || item;
							const label = item?._shuffleLabel || item?.Name || String(item);
							return (
								<SpottableButton
									key={id}
									className={`${css.pickerItem} ${index === 0 ? 'spottable-default' : ''}`}
									onClick={() => onPick(item)}
									spotlightId={`shuffle-picker-item-${index}`}
								>
									{label}
								</SpottableButton>
							);
						})}
					</div>
				)}
				<SpottableButton
					className={css.pickerCancel}
					onClick={onClose}
					spotlightId="shuffle-picker-cancel"
				>
					{$L('Cancel')}
				</SpottableButton>
			</PickerContainer>
		</div>
	);
};

const ShuffleOverlay = ({
	open,
	onClose,
	onSelectItem,
	api,
	unifiedMode,
	contentType,
	serverUrl,
	accessToken,
	originSpotlightId
}) => {
	const {settings} = useSettings();
	const [items, setItems] = useState([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const [activeLibrary, setActiveLibrary] = useState(null);
	const [activeGenre, setActiveGenre] = useState(null);
	const [pickerMode, setPickerMode] = useState('');
	const [pickerItems, setPickerItems] = useState([]);
	const [pickerLoading, setPickerLoading] = useState(false);
	const [focusedCardIndex, setFocusedCardIndex] = useState(null);
	const lastFocusRef = useRef('shuffle-action-random');

	const selectedItem = items[selectedIndex] || null;
	const focusIds = useMemo(() => getFocusList(items), [items]);

	const closeAndRestore = useCallback(() => {
		onClose?.();
		const originId = originSpotlightId || 'navbar-shuffle';
		setTimeout(() => {
			if (!Spotlight.focus(originId)) {
				Spotlight.focus('navbar-home');
			}
		}, 0);
	}, [onClose, originSpotlightId]);

	const loadItems = useCallback(async ({libraryId = null, genreName = null, restoreFocusId = 'shuffle-action-random'} = {}) => {
		setLoading(true);
		setError(false);
		try {
			const result = await fetchRandomItems({
				api,
				unifiedMode,
				contentType,
				limit: 5,
				libraryId,
				genreName
			});
			setItems(result);
			setSelectedIndex(0);
			lastFocusRef.current = restoreFocusId;
		} catch {
			setItems([]);
			setSelectedIndex(0);
			setError(true);
		} finally {
			setLoading(false);
		}
	}, [api, contentType, unifiedMode]);

	useEffect(() => {
		if (!open) return;
		setActiveLibrary(null);
		setActiveGenre(null);
		setPickerMode('');
		setPickerItems([]);
		setFocusedCardIndex(null);
		loadItems({libraryId: null, genreName: null});
	}, [open, loadItems]);

	const handleRetry = useCallback(() => {
		loadItems({
			libraryId: activeLibrary?.Id || null,
			genreName: activeGenre || null,
			restoreFocusId: lastFocusRef.current
		});
	}, [activeGenre, activeLibrary?.Id, loadItems]);

	useEffect(() => {
		if (!open || pickerMode) return;
		const timer = setTimeout(() => {
			const preferred = items.length ? 'shuffle-card-0' : lastFocusRef.current;
			Spotlight.focus(preferred);
		}, 50);
		return () => clearTimeout(timer);
	}, [open, items, pickerMode]);

	useEffect(() => {
		if (!open) return;
		const handleKey = (e) => {
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				if (pickerMode) {
					setPickerMode('');
					return;
				}
				closeAndRestore();
				return;
			}

			if (pickerMode) return;
			const code = e.keyCode || e.which;
			if (code !== KEYS.LEFT && code !== KEYS.RIGHT && code !== KEYS.UP && code !== KEYS.DOWN) return;
			const current = Spotlight.getCurrent();
			if (!current) return;
			const currentId = current.getAttribute?.('data-spotlight-id') || '';

			if (currentId.indexOf('shuffle-card-') === 0) {
				const index = Number(currentId.replace('shuffle-card-', ''));
				if (code === KEYS.DOWN) {
					e.preventDefault();
					e.stopPropagation();
					Spotlight.focus('shuffle-action-random');
					return;
				}
				if (code === KEYS.RIGHT && index === items.length - 1) {
					e.preventDefault();
					e.stopPropagation();
					return;
				}
			}

			if (!focusIds.includes(currentId)) {
				e.preventDefault();
				e.stopPropagation();
				Spotlight.focus(lastFocusRef.current);
			}
		};

		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [closeAndRestore, focusIds, items.length, open, pickerMode]);

	const openLibraryPicker = useCallback(async () => {
		setPickerMode('library');
		setFocusedCardIndex(null);
		setPickerLoading(true);
		try {
			const libs = await fetchShuffleLibraries({api, unifiedMode, contentType});
			setPickerItems(libs);
		} finally {
			setPickerLoading(false);
		}
	}, [api, contentType, unifiedMode]);

	const openGenrePicker = useCallback(async () => {
		setPickerMode('genre');
		setFocusedCardIndex(null);
		setPickerLoading(true);
		try {
			const genres = await fetchShuffleGenres({api, unifiedMode, contentType});
			setPickerItems(genres);
		} finally {
			setPickerLoading(false);
		}
	}, [api, contentType, unifiedMode]);

	const handlePickLibrary = useCallback((library) => {
		setActiveLibrary(library);
		setActiveGenre(null);
		setPickerMode('');
		setPickerItems([]);
		setFocusedCardIndex(null);
		loadItems({libraryId: library.Id, genreName: null, restoreFocusId: 'shuffle-action-library'});
	}, [loadItems]);

	const handlePickGenre = useCallback((genreName) => {
		setActiveGenre(genreName);
		setActiveLibrary(null);
		setPickerMode('');
		setPickerItems([]);
		setFocusedCardIndex(null);
		loadItems({libraryId: null, genreName, restoreFocusId: 'shuffle-action-genres'});
	}, [loadItems]);

	if (!open) return null;

	const selectedRuntime = formatRuntime(selectedItem?.RunTimeTicks);
	const infoBits = [
		selectedItem?.OfficialRating,
		selectedItem?.ProductionYear ? String(selectedItem.ProductionYear) : '',
		selectedRuntime,
		selectedItem?.Genres?.length ? selectedItem.Genres.slice(0, 3).join(', ') : ''
	].filter(Boolean);
	const selectedServerUrl = selectedItem?._serverUrl || serverUrl;
	const mdblistPluginEnabled = settings.useMoonfinPlugin && settings.mdblistEnabled !== false;

	return (
		<div className={css.overlay}>
			<DialogContainer className={`${css.dialog} ${pickerMode ? css.dialogDimmed : ''}`} spotlightId="shuffle-overlay-dialog">
				<div className={css.topStrip}>
					<div className={css.badge}>{$L('Random Shuffle')}</div>
					<div className={css.filterSummary}>
						{activeLibrary ? `${$L('Library')}: ${activeLibrary._shuffleLabel || activeLibrary.Name}` : activeGenre ? `${$L('Genre')}: ${activeGenre}` : $L('All Libraries')}
					</div>
				</div>

				<div className={css.cardsRow}>
					{loading ? (
						<div className={css.stateLabel}>{$L('Loading your library...')}</div>
					) : error ? (
						<>
							<div className={css.stateLabel}>{$L('Unable to connect to server')}</div>
							<SpottableButton className={`${css.retryBtn} spottable-default`} onClick={handleRetry} spotlightId="shuffle-retry-btn">
								{$L('Try Again')}
							</SpottableButton>
						</>
					) : items.length === 0 ? (
						<div className={css.stateLabel}>{$L('No items found')}</div>
					) : (
						items.map((item, index) => {
							const isActive = index === focusedCardIndex;
							const imageUrl = buildItemImageUrl(item, serverUrl, accessToken);
							return (
								<SpottableButton
									key={`${item._serverId || 'single'}-${item.Id}-${index}`}
									className={`${css.card} ${isActive ? css.cardActive : ''} ${index === 0 ? 'spottable-default' : ''}`}
									onFocus={() => {
										setFocusedCardIndex(index);
										setSelectedIndex(index);
										lastFocusRef.current = `shuffle-card-${index}`;
									}}
									onClick={() => {
										if (selectedIndex !== index) {
											setSelectedIndex(index);
											return;
										}
										onSelectItem?.(item);
										onClose?.();
									}}
									spotlightId={`shuffle-card-${index}`}
								>
									<div className={css.cardPosterWrap}>
										{imageUrl ? (
											<img className={css.cardPoster} src={imageUrl} alt={item.Name || ''} />
										) : (
											<div className={css.posterFallback}>{item.Name?.[0] || '?'}</div>
										)}
									</div>
								</SpottableButton>
							);
						})
					)}
				</div>

				<div className={css.infoPanel}>
					<div className={css.itemTitle}>{selectedItem?.Name || $L('No items found')}</div>
					<div className={css.metaLine}>
						{infoBits.map((text) => (
							<span key={text} className={css.metaItem}>{text}</span>
						))}
					</div>
					<div className={css.ratingsLine}>
						<RatingsRow
							item={selectedItem}
							serverUrl={selectedServerUrl}
							compact
							pluginEnabled={mdblistPluginEnabled}
						/>
					</div>
					<div className={css.overview}>{selectedItem?.Overview || $L('Discover a random item from your library.')}</div>
				</div>

				<div className={css.actions}>
					<SpottableButton
						className={css.actionBtn}
						onFocus={() => {
							setFocusedCardIndex(null);
							lastFocusRef.current = 'shuffle-action-library';
						}}
						onClick={openLibraryPicker}
						spotlightId="shuffle-action-library"
					>
						{$L('Library Shuffle')}
					</SpottableButton>
					<SpottableButton
						className={`${css.actionBtn} ${css.actionPrimary}`}
						onFocus={() => {
							setFocusedCardIndex(null);
							lastFocusRef.current = 'shuffle-action-random';
						}}
						onClick={() => loadItems({libraryId: null, genreName: null, restoreFocusId: 'shuffle-action-random'})}
						spotlightId="shuffle-action-random"
					>
						{$L('Random Shuffle')}
					</SpottableButton>
					<SpottableButton
						className={css.actionBtn}
						onFocus={() => {
							setFocusedCardIndex(null);
							lastFocusRef.current = 'shuffle-action-genres';
						}}
						onClick={openGenrePicker}
						spotlightId="shuffle-action-genres"
					>
						{$L('Genres Shuffle')}
					</SpottableButton>
				</div>
			</DialogContainer>

			<PickerDialog
				open={pickerMode === 'library'}
				title={$L('Select Library')}
				items={pickerItems}
				loading={pickerLoading}
				emptyLabel={$L('No libraries found')}
				onClose={() => setPickerMode('')}
				onPick={handlePickLibrary}
			/>
			<PickerDialog
				open={pickerMode === 'genre'}
				title={$L('Select Genre')}
				items={pickerItems}
				loading={pickerLoading}
				emptyLabel={$L('No genres found')}
				onClose={() => setPickerMode('')}
				onPick={handlePickGenre}
			/>
		</div>
	);
};

export default memo(ShuffleOverlay);
