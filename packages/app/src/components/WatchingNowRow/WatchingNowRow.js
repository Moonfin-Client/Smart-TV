import {useCallback, useRef, useEffect, useState, memo} from 'react';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import MediaCard from '../MediaCard';
import {KEYS} from '../../utils/keys';
import {useSettings} from '../../context/SettingsContext';
import {CORE_ICON_PATHS} from '../../views/Settings/settingsCoreIcons';

import rowCss from '../MediaRow/MediaRow.module.less';
import css from './WatchingNowRow.module.less';

const RowContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	defaultElement: '[data-media-card]'
}, 'div');

const CardLogo = ({url, name}) => {
	const [failed, setFailed] = useState(false);
	const handleError = useCallback(() => setFailed(true), []);
	if (!url || failed) return <div className={css.logoTitle}>{name}</div>;
	return <img className={css.logo} src={url} alt={name} onError={handleError} />;
};

const WatchingNowOverlay = ({item}) => (
	<>
		<div className={css.scrim} />
		<span className={css.rank}>{item.Rank}</span>
		<span className={css.type}>{(item.Type === 'Series' ? $L('Series') : $L('Movie')).toUpperCase()}</span>
		<div className={css.logoBox}>
			<CardLogo url={item._externalLogoUrl} name={item.Name} />
		</div>
		<div className={css.watchers}>
			<span className={css.watcherDot} />
			{$L('{count} watching').replace('{count}', String(item.Watchers))}
		</div>
	</>
);

const WatchingNowRow = ({
	title,
	subtitle,
	items,
	serverUrl,
	onSelectItem,
	onFocus,
	onFocusItem,
	rowIndex,
	rowId,
	onNavigateUp,
	onNavigateDown,
	rowSpacing,
	registerRowRef
}) => {
	const {settings} = useSettings();
	const scrollerRef = useRef(null);
	const scrollerRectRef = useRef(null);
	const scrollTimeoutRef = useRef(null);
	const rowElementRef = useRef(null);

	useEffect(() => {
		const el = rowElementRef.current;
		registerRowRef?.(rowIndex, el);
		return () => registerRowRef?.(rowIndex, null);
	}, [rowIndex, registerRowRef]);

	useEffect(() => {
		scrollerRectRef.current = null;
		const invalidate = () => {
			scrollerRectRef.current = null;
		};
		window.addEventListener('resize', invalidate);
		return () => window.removeEventListener('resize', invalidate);
	}, [settings.navbarPosition]);

	const handleFocus = useCallback((e) => {
		onFocus?.(rowIndex);

		if (Spotlight.getPointerMode()) return;

		const card = e.target.closest('.spottable');
		const scroller = scrollerRef.current;
		if (card && scroller) {
			if (scrollTimeoutRef.current) {
				window.cancelAnimationFrame(scrollTimeoutRef.current);
			}
			scrollTimeoutRef.current = window.requestAnimationFrame(() => {
				const cardRect = card.getBoundingClientRect();
				if (!scrollerRectRef.current) {
					scrollerRectRef.current = scroller.getBoundingClientRect();
				}
				const scrollerRect = scrollerRectRef.current;
				if (cardRect.left < scrollerRect.left) {
					scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
				} else if (cardRect.right > scrollerRect.right) {
					scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
				}
			});
		}
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

	const handleWrapLeft = useCallback((e) => {
		e.preventDefault();
		e.stopPropagation();
		if (settings.navbarPosition === 'left') {
			if (!Spotlight.focus('navbar')) {
				Spotlight.move('left');
			}
		} else {
			Spotlight.focus(`media-${rowId}-${items[items.length - 1].Id}`);
		}
	}, [items, rowId, settings.navbarPosition]);

	const handleWrapRight = useCallback((e) => {
		e.preventDefault();
		e.stopPropagation();
		Spotlight.focus(`media-${rowId}-${items[0].Id}`);
	}, [items, rowId]);

	if (!items || items.length === 0) return null;

	const rowClassName = [
		rowCss.row,
		settings.fullScreenRows === true ? rowCss.fullScreenRows : '',
		settings.fullScreenRows === true && settings.homeRowOverlay !== false ? rowCss.withOverlay : ''
	].filter(Boolean).join(' ');
	const rowStyle = typeof rowSpacing === 'number' ? {marginBottom: rowSpacing + 'px'} : undefined;

	return (
		<RowContainer
			ref={rowElementRef}
			className={rowClassName}
			spotlightId={`row-${rowIndex}`}
			data-row-index={rowIndex}
			data-row-id={rowId}
			onKeyDown={handleKeyDown}
			style={rowStyle}
		>
			<div className={css.header}>
				<svg className={css.globeIcon} viewBox="0 0 24 24"><path d={CORE_ICON_PATHS.public} /></svg>
				<h2 className={`${rowCss.title} ${css.title}`}>{title}</h2>
			</div>
			{subtitle && (
				<div className={css.summary}>
					<span className={css.liveDot} />
					<span className={css.subtitle}>{subtitle}</span>
				</div>
			)}
			<div className={rowCss.scroller} ref={scrollerRef} onFocus={handleFocus}>
				<div className={rowCss.items}>
					{items.map((item, index) => (
						<MediaCard
							key={`${rowId}-${item.Id}-${index}`}
							item={item}
							serverUrl={serverUrl}
							cardType="landscape"
							rowImageType="backdrop"
							onSelect={onSelectItem}
							onFocusItem={onFocusItem}
							eagerLoad={rowIndex === 0}
							spotlightId={`media-${rowId}-${item.Id}`}
							onSpotlightLeft={index === 0 ? handleWrapLeft : null}
							onSpotlightRight={index === items.length - 1 ? handleWrapRight : null}
							overlay={<WatchingNowOverlay item={item} />}
							showInfo={false}
						/>
					))}
				</div>
			</div>
		</RowContainer>
	);
};

export default memo(WatchingNowRow);
