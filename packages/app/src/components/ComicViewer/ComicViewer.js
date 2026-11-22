import {useState, useEffect, useCallback, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import {isBackKey, KEYS} from '../../utils/keys';
import {fetchBook, startPage} from '../../utils/books';
import {openComicPages} from '../../utils/comicPages';
import {FIXED_LAYOUT_INVERT_KEY} from '../../utils/readerSettings';
import {ModalContainer} from '../../utils/spotlightContainers';
import {getFromStorage, saveToStorage} from '../../services/storage';
import {CORE_ICON_PATHS} from '../../views/Settings/settingsCoreIcons';
import useBookProgress from '../../hooks/useBookProgress';
import useReturnFocus from '../../hooks/useReturnFocus';
import css from './ComicViewer.module.less';

const SpottableDiv = Spottable('div');

// Pages this far from the current one stay ready, the rest are let go.
const KEEP_AROUND = 2;
const DIRECTION_KEY = 'book_reader_comic_direction';
const AUTO_HIDE_KEY = 'book_reader_comic_auto_hide';
const HIDE_AFTER_MS = 4000;

// Left and right follow the reading direction, so in a right to left comic Left is the next page.
export const comicPageStep = (keyCode, rtl) => {
	if (keyCode === KEYS.RIGHT) return rtl ? -1 : 1;
	if (keyCode === KEYS.LEFT) return rtl ? 1 : -1;
	return 0;
};

const ControlToggle = ({icon, active, label, ...rest}) => (
	<SpottableDiv className={css.toggle + (active ? ' ' + css.toggleOn : '')} aria-label={label} {...rest}>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
	</SpottableDiv>
);

const ComicViewer = ({item, archive, serverUrl, accessToken, onClose}) => {
	const [count, setCount] = useState(0);
	const [currentPage, setCurrentPage] = useState(0);
	const [urls, setUrls] = useState({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [imageLoaded, setImageLoaded] = useState(false);
	const [showInfo, setShowInfo] = useState(true);
	const [invert, setInvert] = useState(false);
	const [rtl, setRtl] = useState(false);
	const [autoHide, setAutoHide] = useState(true);
	const hideTimerRef = useRef(null);
	const hoveredRef = useRef(false);
	const barsRef = useRef(null);
	const sourceRef = useRef(null);
	const urlsRef = useRef({});
	const ready = !loading && !error && count > 0;
	const live = useRef({});
	live.current = {showInfo, autoHide, ready};

	useBookProgress(item, currentPage, count);
	useReturnFocus(showInfo);

	useEffect(() => {
		if (!item) return;

		let cancelled = false;
		const open = async () => {
			try {
				const [buffer, storedInvert, storedDirection, storedAutoHide] = await Promise.all([
					fetchBook(item, serverUrl, accessToken),
					getFromStorage(FIXED_LAYOUT_INVERT_KEY).catch(() => null),
					getFromStorage(DIRECTION_KEY).catch(() => null),
					getFromStorage(AUTO_HIDE_KEY).catch(() => null)
				]);
				const source = await openComicPages(buffer, archive);
				if (cancelled) {
					source.close();
					return;
				}
				sourceRef.current = source;
				setInvert(storedInvert === true);
				setRtl(storedDirection === 'rtl');
				setAutoHide(storedAutoHide !== false);
				setCount(source.names.length);
				setCurrentPage(startPage(item, source.names.length));
				setLoading(false);
			} catch (err) {
				if (!cancelled) {
					setError($L('Failed to open comic'));
					setLoading(false);
				}
			}
		};

		open();
		return () => {
			cancelled = true;
			if (sourceRef.current) sourceRef.current.close();
			sourceRef.current = null;
			Object.keys(urlsRef.current).forEach((key) => {
				if (urlsRef.current[key]) URL.revokeObjectURL(urlsRef.current[key]);
			});
			urlsRef.current = {};
		};
	}, [item, archive, serverUrl, accessToken]);

	useEffect(() => {
		const source = sourceRef.current;
		if (!source || count <= 0) return;

		Object.keys(urlsRef.current).forEach((key) => {
			if (Math.abs(Number(key) - currentPage) <= KEEP_AROUND) return;
			if (urlsRef.current[key]) URL.revokeObjectURL(urlsRef.current[key]);
			delete urlsRef.current[key];
		});

		for (let page = currentPage - 1; page <= currentPage + KEEP_AROUND; page++) {
			if (page < 0 || page >= count || page in urlsRef.current) continue;
			urlsRef.current[page] = null;
			source.load(page).then((blob) => {
				if (sourceRef.current !== source || urlsRef.current[page] !== null) return;
				urlsRef.current[page] = URL.createObjectURL(blob);
				setUrls({...urlsRef.current});
			}, () => {
				if (sourceRef.current === source) setError($L('Failed to open comic'));
			});
		}
		setUrls({...urlsRef.current});
	}, [currentPage, count]);

	// The bars hide a few seconds after they show unless they're set to stay, and not while the
	// pointer rests on them.
	const scheduleHide = useCallback(() => {
		clearTimeout(hideTimerRef.current);
		const {showInfo: visible, autoHide: fading, ready: open} = live.current;
		if (!open || !fading || !visible || hoveredRef.current) return;
		hideTimerRef.current = setTimeout(() => setShowInfo(false), HIDE_AFTER_MS);
	}, []);

	useEffect(() => {
		scheduleHide();
		return () => clearTimeout(hideTimerRef.current);
	}, [showInfo, autoHide, ready, scheduleHide]);

	// Focus goes back where it was when the bars hide, and if that can't happen it still leaves
	// them, so a stray OK can't press a control nobody can see.
	useEffect(() => {
		if (showInfo) return;
		hoveredRef.current = false;
		if (barsRef.current && barsRef.current.contains(document.activeElement)) document.activeElement.blur();
	}, [showInfo]);

	const turn = useCallback((step) => {
		const next = Math.min(Math.max(currentPage + step, 0), count - 1);
		if (next === currentPage) return;
		setImageLoaded(false);
		setCurrentPage(next);
	}, [count, currentPage]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			const key = e.keyCode;
			if (showInfo) scheduleHide();
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				if (showInfo && ready) setShowInfo(false);
				else onClose?.();
				return;
			}
			const arrow = key === KEYS.LEFT || key === KEYS.RIGHT || key === KEYS.UP || key === KEYS.DOWN;
			if (!(arrow || key === KEYS.ENTER || key === KEYS.SPACE)) return;
			// The remote walks the bars while they're up. A press from outside only brings focus in.
			if (ready && showInfo && barsRef.current && barsRef.current.contains(document.activeElement)) return;
			e.preventDefault();
			e.stopPropagation();
			if (!ready) return;
			if (showInfo) {
				Spotlight.focus('comic-controls');
				return;
			}
			const step = comicPageStep(key, rtl);
			if (step) turn(step);
			else setShowInfo(true);
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [onClose, turn, showInfo, ready, rtl, scheduleHide]);

	const handlePointerMove = useCallback(() => {
		if (!autoHide || !ready) return;
		if (showInfo) scheduleHide();
		else setShowInfo(true);
	}, [autoHide, ready, showInfo, scheduleHide]);

	const holdBars = useCallback(() => {
		hoveredRef.current = true;
		clearTimeout(hideTimerRef.current);
	}, []);

	const releaseBars = useCallback(() => {
		hoveredRef.current = false;
		scheduleHide();
	}, [scheduleHide]);

	const toggleDirection = useCallback(() => {
		setRtl(!rtl);
		saveToStorage(DIRECTION_KEY, rtl ? 'ltr' : 'rtl').catch(() => {});
	}, [rtl]);

	const toggleInvert = useCallback(() => {
		setInvert(!invert);
		saveToStorage(FIXED_LAYOUT_INVERT_KEY, !invert).catch(() => {});
	}, [invert]);

	const toggleAutoHide = useCallback(() => {
		setAutoHide(!autoHide);
		saveToStorage(AUTO_HIDE_KEY, !autoHide).catch(() => {});
	}, [autoHide]);

	const handleImageLoad = useCallback(() => {
		setImageLoaded(true);
	}, []);

	if (loading) {
		return (
			<div className={css.viewer}>
				<div className={css.loadingContainer}>
					<div className={css.spinner} />
					<div className={css.loadingText}>{$L('Opening comic...')}</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={css.viewer}>
				<div className={css.loadingContainer}>
					<div className={css.errorText}>{error}</div>
					<div className={css.loadingText}>{$L('Press Back to close')}</div>
				</div>
			</div>
		);
	}

	if (count === 0) {
		return (
			<div className={css.viewer}>
				<div className={css.loadingContainer}>
					<div className={css.errorText}>{$L('No pages found.')}</div>
					<div className={css.loadingText}>{$L('Press Back to close')}</div>
				</div>
			</div>
		);
	}

	const url = urls[currentPage];
	return (
		<div className={css.viewer} onMouseMove={handlePointerMove}>
			<div className={css.imageContainer}>
				{url && (
					<img
						key={currentPage}
						src={url}
						alt={$L('Page') + ' ' + (currentPage + 1)}
						className={css.page + (imageLoaded ? ' ' + css.pageLoaded : '') + (invert ? ' ' + css.inverted : '')}
						onLoad={handleImageLoad}
					/>
				)}
				{(!url || !imageLoaded) && (
					<div className={css.loading}>
						<div className={css.spinner} />
					</div>
				)}
			</div>

			<div className={css.infoOverlay + (showInfo ? ' ' + css.infoVisible : '')}>
				<div className={css.topBar}>
					<div className={css.title}>{item.Name || $L('Comic')}</div>
				</div>
				<div ref={barsRef} className={css.bottomStack} onMouseEnter={holdBars} onMouseLeave={releaseBars}>
					<ModalContainer className={css.controlsBar} spotlightId="comic-controls">
						<ControlToggle
							icon={rtl ? CORE_ICON_PATHS.format_textdirection_r_to_l : CORE_ICON_PATHS.format_textdirection_l_to_r}
							active={rtl}
							label={rtl ? $L('Right to left (manga)') : $L('Left to right')}
							onClick={toggleDirection}
						/>
						<ControlToggle icon={CORE_ICON_PATHS.invert_colors} active={invert} label={$L('Invert colors')} onClick={toggleInvert} />
						<ControlToggle
							icon={autoHide ? CORE_ICON_PATHS.visibility_off : CORE_ICON_PATHS.visibility}
							active={autoHide}
							label={autoHide ? $L('Controls hide automatically') : $L('Controls stay visible')}
							onClick={toggleAutoHide}
						/>
					</ModalContainer>
					<div className={css.bottomBar}>
						<div className={css.pageCounter}>
							{currentPage + 1} / {count}
						</div>
						<div className={css.navHint}>{'◀ ▶ ' + $L('Navigate')} &nbsp; {'OK ' + $L('Menu')}</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ComicViewer;
