import {useState, useEffect, useCallback, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import {isBackKey, KEYS} from '../../utils/keys';
import {epubTicks, fetchBook, newerServerEpubFraction} from '../../utils/books';
import {loadEpubJs, openEpub} from '../../utils/epubEngine';
import {READER_DEFAULTS, READER_SETTINGS_KEY, normalizeReaderSettings, readerPageStyle, readerTint} from '../../utils/readerSettings';
import {getFromStorage, saveToStorage} from '../../services/storage';
import {getApiForItem} from '../../services/connectionPool';
import {api as activeApi, getServerType} from '../../services/jellyfinApi';
import {ModalContainer} from '../../utils/spotlightContainers';
import {ChromeButton, ContentsPanel, DisplayPanel} from './ReaderPanels';
import viewerCss from '../ComicViewer/ComicViewer.module.less';
import css from './EpubReader.module.less';

const SpottableDiv = Spottable('div');

const ICONS = {
	contents: 'M3 18H21V15.98H3V18ZM3 12.98H21V11.02H3V12.98ZM3 6V8.02H21V6H3Z',
	bookmark: 'M17.02 3H6.98C5.91 3 5.02 3.89 5.02 5.02V21L12 18L18.98 21V5.02C18.98 3.89 18.09 3 17.02 3Z',
	bookmarkBorder: 'M17.02 3H6.98C5.91 3 5.02 3.89 5.02 5.02V21L12 18L18.98 21V5.02C18.98 3.89 18.09 3 17.02 3ZM17.02 18 12 15.8 6.98 18V5.02H17.02V18Z'
};

const placeKey = (item) => `epub_place_${item.ServerId || ''}_${item.Id}`;
const bookmarksKey = (item) => `epub_bookmarks_${item.ServerId || ''}_${item.Id}`;

// Reader sizes are set for a 960 by 540 page and scaled up to the screen.
const pageStyleFor = (settings) => {
	const unit = window.innerHeight / 540;
	return readerPageStyle(settings, {baseSize: 18 * unit, unit});
};

// The chapter on screen: the first entry for the latest section at or before it, since a
// chapter's own headings all sit in its section too.
const chapterAt = (toc, index) => {
	let found = -1;
	toc.forEach((entry, i) => {
		if (entry.index >= 0 && entry.index <= index && (found < 0 || entry.index > toc[found].index)) found = i;
	});
	return found;
};

const SCRUB_STEP = 0.01;

const EpubReader = ({item, serverUrl, accessToken, onClose}) => {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [place, setPlace] = useState(null);
	const [showInfo, setShowInfo] = useState(true);
	const [settings, setSettings] = useState(READER_DEFAULTS);
	const [chrome, setChrome] = useState(false);
	const [panel, setPanel] = useState(null);
	const [toc, setToc] = useState([]);
	const [bookmarks, setBookmarks] = useState([]);
	const [scrub, setScrub] = useState(null);
	const readerRef = useRef(null);
	const engineRef = useRef(null);
	const infoTimerRef = useRef(null);
	const saveTimerRef = useRef(null);
	const keyRef = useRef(null);
	const settingsRef = useRef(READER_DEFAULTS);
	const openerRef = useRef(null);

	const resetInfoTimer = useCallback(() => {
		setShowInfo(true);
		if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
		infoTimerRef.current = setTimeout(() => setShowInfo(false), 4000);
	}, []);

	const closeMenus = useCallback(() => {
		setPanel(null);
		setChrome(false);
		setScrub(null);
	}, []);

	const handleKey = useCallback((e) => {
		const engine = engineRef.current;
		const key = e.keyCode;
		if (isBackKey(e)) {
			e.preventDefault();
			e.stopPropagation();
			if (panel) setPanel(null);
			else if (chrome) closeMenus();
			else onClose?.();
			return;
		}
		// The menus are walked with the remote like any other screen.
		if (chrome || panel) return;
		if (key === KEYS.LEFT || key === KEYS.RIGHT) {
			e.preventDefault();
			e.stopPropagation();
			if (engine) engine.turnToward(key === KEYS.RIGHT ? 1 : -1);
		} else if (key === KEYS.UP || key === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			if (engine) engine[key === KEYS.DOWN ? 'next' : 'prev']();
		} else if (key === KEYS.ENTER || key === KEYS.SPACE) {
			e.preventDefault();
			e.stopPropagation();
			if (engine) setChrome(true);
		}
	}, [onClose, chrome, panel, closeMenus]);
	keyRef.current = handleKey;

	useEffect(() => {
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [handleKey]);

	// Focus moves into whatever just opened, and back to the button that raised a panel once it closes.
	useEffect(() => {
		if (panel) Spotlight.focus('epub-panel');
		else if (chrome) Spotlight.focus(openerRef.current || 'epub-contents');
		if (!chrome) openerRef.current = null;
	}, [chrome, panel]);

	useEffect(() => {
		if (!item) return;
		let cancelled = false;
		// Jellyfin's EPUB position is the percentage jellyfin-web reads. Emby has no
		// such contract, so it only gets this TV's own exact place.
		const reportsProgress = (item._serverType || getServerType()) !== 'emby';
		let latest = null;
		let reportedTicks = null;
		let bytes = 0;

		const save = () => {
			clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
			const at = latest;
			if (!at) return;
			const savedAt = Date.now();
			const record = (reported) => ({cfi: at.cfi, ticks: reported, bytes, savedAt});
			saveToStorage(placeKey(item), record(reportedTicks)).catch(() => {});
			if (!reportsProgress || at.percentage == null) return;
			const ticks = epubTicks(at.percentage);
			if (ticks === reportedTicks) return;
			const api = getApiForItem(item) || activeApi;
			// The ticks kept with the place are the last the server took, which is how
			// the next open knows the server position is this one.
			api.setPlaybackPosition(item.Id, ticks).then(() => {
				reportedTicks = ticks;
				saveToStorage(placeKey(item), record(ticks)).catch(() => {});
				if (at.atEnd) return api.setWatched(item.Id, true);
			}).catch(() => {});
		};

		const open = async () => {
			try {
				const [ePub, buffer, stored, storedSettings, storedBookmarks] = await Promise.all([
					loadEpubJs(),
					fetchBook(item, serverUrl, accessToken),
					getFromStorage(placeKey(item)).catch(() => null),
					getFromStorage(READER_SETTINGS_KEY).catch(() => null),
					getFromStorage(bookmarksKey(item)).catch(() => null)
				]);
				if (cancelled) return;
				const look = normalizeReaderSettings(storedSettings);
				settingsRef.current = look;
				setSettings(look);
				if (Array.isArray(storedBookmarks)) setBookmarks(storedBookmarks);
				bytes = buffer.byteLength;
				// A different file size means the server has another copy of the book,
				// where the saved spot may point anywhere.
				const local = stored && stored.cfi && stored.bytes === bytes ? stored : null;
				reportedTicks = local ? local.ticks : null;
				const fraction = reportsProgress ? newerServerEpubFraction(item, local) : null;
				const engine = await openEpub({
					ePub,
					element: readerRef.current,
					buffer,
					cfi: fraction == null && local ? local.cfi : null,
					fraction,
					style: pageStyleFor(look),
					onKey: (e) => keyRef.current(e),
					onRelocated: (at) => {
						latest = at;
						setPlace(at);
						clearTimeout(saveTimerRef.current);
						saveTimerRef.current = setTimeout(save, 2000);
					}
				});
				if (cancelled) {
					engine.destroy();
					return;
				}
				engineRef.current = engine;
				setToc(engine.toc());
				setLoading(false);
				resetInfoTimer();
			} catch (err) {
				if (!cancelled) {
					setError($L('Failed to open book'));
					setLoading(false);
				}
			}
		};

		open();
		return () => {
			cancelled = true;
			if (saveTimerRef.current) save();
			if (engineRef.current) engineRef.current.destroy();
			engineRef.current = null;
		};
	}, [item, serverUrl, accessToken, resetInfoTimer]);

	useEffect(() => () => {
		if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
	}, []);

	useEffect(() => {
		if (place) resetInfoTimer();
	}, [place && place.cfi]); // eslint-disable-line react-hooks/exhaustive-deps

	const updateSettings = useCallback((patch) => {
		const next = normalizeReaderSettings({...settingsRef.current, ...patch});
		settingsRef.current = next;
		setSettings(next);
		saveToStorage(READER_SETTINGS_KEY, next).catch(() => {});
		if (engineRef.current) engineRef.current.restyle(pageStyleFor(next));
	}, []);

	const openPanel = useCallback((ev) => {
		openerRef.current = ev.currentTarget.dataset.spotlightId;
		setPanel(ev.currentTarget.dataset.panel);
	}, []);

	const openTarget = useCallback((target) => {
		if (engineRef.current && target) engineRef.current.display(target);
		closeMenus();
	}, [closeMenus]);

	const currentChapter = place && place.index != null ? chapterAt(toc, place.index) : -1;
	const bookmarked = Boolean(place && bookmarks.some((mark) => mark.cfi === place.cfi));

	const toggleBookmark = useCallback(() => {
		if (!place) return;
		const next = bookmarked
			? bookmarks.filter((mark) => mark.cfi !== place.cfi)
			: [...bookmarks, {
				cfi: place.cfi,
				label: (currentChapter >= 0 && toc[currentChapter].label) || item.Name || $L('Book'),
				percentage: place.percentage
			}].sort((a, b) => (a.percentage ?? 2) - (b.percentage ?? 2));
		setBookmarks(next);
		saveToStorage(bookmarksKey(item), next).catch(() => {});
	}, [place, bookmarked, bookmarks, currentChapter, toc, item]);

	const shownFraction = scrub != null ? scrub : place && place.percentage;

	// Left and right move the mark and OK goes there, so a long book is crossed without paging it.
	const handleScrubKey = useCallback((e) => {
		const key = e.keyCode;
		if (key !== KEYS.LEFT && key !== KEYS.RIGHT && key !== KEYS.ENTER) return;
		if (shownFraction == null) return;
		e.preventDefault();
		e.stopPropagation();
		if (key === KEYS.ENTER) {
			if (scrub != null && engineRef.current) engineRef.current.displayFraction(scrub);
			setScrub(null);
			return;
		}
		const step = key === KEYS.RIGHT ? SCRUB_STEP : -SCRUB_STEP;
		setScrub(Math.min(1, Math.max(0, Math.round((shownFraction + step) * 100) / 100)));
	}, [scrub, shownFraction]);

	const clearScrub = useCallback(() => setScrub(null), []);

	const pageStyle = pageStyleFor(settings);
	const tint = readerTint(settings);

	return (
		<div className={viewerCss.viewer + ' ' + css.reader} style={{background: pageStyle.bg}}>
			<div className={css.frame} style={{maxWidth: pageStyle.maxWidth, paddingLeft: pageStyle.margin, paddingRight: pageStyle.margin}}>
				<div ref={readerRef} className={css.pages} />
			</div>
			{tint && <div className={css.tint} style={{background: '#000', opacity: tint.dim}} />}
			{tint && <div className={css.tint} style={{background: '#ff9b2e', opacity: tint.warmth}} />}
			{loading && (
				<div className={css.cover}>
					<div className={viewerCss.loadingContainer}>
						<div className={viewerCss.spinner} />
						<div className={viewerCss.loadingText}>{$L('Opening book...')}</div>
					</div>
				</div>
			)}
			{error && (
				<div className={css.cover}>
					<div className={viewerCss.loadingContainer}>
						<div className={viewerCss.errorText}>{error}</div>
						<div className={viewerCss.loadingText}>{$L('Press Back to close')}</div>
					</div>
				</div>
			)}
			{!loading && !error && !chrome && (
				<div className={viewerCss.infoOverlay + (showInfo ? ' ' + viewerCss.infoVisible : '')}>
					<div className={viewerCss.topBar}>
						<div className={viewerCss.title}>{item.Name || $L('Book')}</div>
					</div>
					<div className={viewerCss.bottomBar}>
						<div className={viewerCss.pageCounter}>
							{place && place.percentage != null ? Math.round(place.percentage * 100) + '%' : ''}
							{place && place.minutesLeft ? ' · ' + $L('{minutes} min left in chapter').replace('{minutes}', place.minutesLeft) : ''}
						</div>
						<div className={viewerCss.navHint}>{'◀ ▶ ' + $L('Navigate')} &nbsp; {'OK ' + $L('Menu')} &nbsp; {$L('Back') + ' ' + $L('Close')}</div>
					</div>
				</div>
			)}
			{chrome && !panel && (
				<ModalContainer className={css.chrome} spotlightId="epub-chrome">
					<div className={css.chromeTop}>
						<div className={css.chromeTitle}>{item.Name || $L('Book')}</div>
						<ChromeButton icon={ICONS.contents} label={$L('Contents')} spotlightId="epub-contents" data-panel="contents" onClick={openPanel} />
						<ChromeButton icon={bookmarked ? ICONS.bookmark : ICONS.bookmarkBorder} label={$L('Bookmark')} spotlightId="epub-bookmark" onClick={toggleBookmark} />
						<ChromeButton mark="Aa" label={$L('Display')} spotlightId="epub-display" data-panel="display" onClick={openPanel} />
					</div>
					<div className={css.chromeBottom}>
						<SpottableDiv className={css.scrubber} spotlightId="epub-scrubber" onKeyDown={handleScrubKey} onBlur={clearScrub}>
							<div className={css.track}>
								<div className={css.fill} style={{width: ((shownFraction || 0) * 100) + '%'}} />
								<div className={css.thumb} style={{left: ((shownFraction || 0) * 100) + '%'}} />
							</div>
						</SpottableDiv>
						<div className={css.scrubLabel}>
							<span>{shownFraction != null ? Math.round(shownFraction * 100) + '%' : ''}</span>
							<span>{scrub == null && place && place.minutesLeft ? $L('{minutes} min left in chapter').replace('{minutes}', place.minutesLeft) : ''}</span>
						</div>
					</div>
				</ModalContainer>
			)}
			{panel === 'contents' && (
				<ContentsPanel toc={toc} currentChapter={currentChapter} bookmarks={bookmarks} onOpen={openTarget} />
			)}
			{panel === 'display' && <DisplayPanel settings={settings} onChange={updateSettings} />}
		</div>
	);
};

export default EpubReader;
