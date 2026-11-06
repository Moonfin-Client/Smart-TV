import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import {useSettings} from '../../context/SettingsContext';
import {initVideo, keepScreenOn} from '../../services/video';
import {getImageUrl} from '../../utils/helpers';
import {KEYS} from '../../utils/keys';
import {uiLocale} from '../../utils/uiLocale';
import usePhotoSlideshow, {FADE_MS, canStartSlideshow, stepIndex, viewerItems} from './usePhotoSlideshow';
import css from './PhotoViewer.module.less';

const PREFETCH_AHEAD = 25;

const PhotoViewer = ({item, items, serverUrl, running, moreCount = 0, onNeedMore, onClose, onSlideshowChange, onPlayVideo}) => {
	const {settings} = useSettings();
	const videosOn = settings.photoSlideshowVideos !== false;
	const intervalMs = Math.min(30, Math.max(3, Number(settings.photoSlideshowInterval) || 5)) * 1000;

	const photoItems = useMemo(() => viewerItems(items, item), [items, item]);

	const [currentIndex, setCurrentIndex] = useState(() => {
		const idx = item ? photoItems.findIndex(i => i.Id === item.Id) : 0;
		return idx >= 0 ? idx : 0;
	});
	const [showInfo, setShowInfo] = useState(true);
	// Where each photo stands, 'ok' or 'failed' once it has loaded, by id.
	const [loaded, setLoaded] = useState({});
	// The photos in the DOM. A photo left behind stays for a moment, fading out as the next fades in, so
	// a fast browse carries each fade on from wherever it had got to rather than cutting it short.
	const [layers, setLayers] = useState([]);
	const lastShownRef = useRef(null);
	// Whether the photo on screen was stepped onto, as opposed to the viewer opening on it.
	const steppedRef = useRef(false);
	const infoTimerRef = useRef(null);
	const pointerAtRef = useRef(0);

	useEffect(() => {
		if (!item || photoItems.length === 0) return;
		const idx = photoItems.findIndex(i => i.Id === item.Id);
		setCurrentIndex(idx >= 0 ? idx : 0);
	}, [item]);  // eslint-disable-line react-hooks/exhaustive-deps

	const currentPhoto = photoItems[currentIndex];
	const currentId = currentPhoto ? currentPhoto.Id : null;
	const status = currentPhoto ? loaded[currentId] : undefined;
	const settled = status !== undefined;
	const imageLoaded = status === 'ok';
	const imageFailed = status === 'failed';
	if (imageLoaded) lastShownRef.current = currentId;

	// A video plays in the player, so the viewer only counts a photo's time (or a still's, with videos off).
	// A video the slideshow reaches, or browsing steps onto, goes straight to the player without its still
	// being drawn. One the viewer comes back to after it has played keeps its still.
	const autoPlays = Boolean(currentPhoto) && currentPhoto.Type === 'Video' && (running ? videosOn : steppedRef.current);
	const playsVideo = Boolean(running) && autoPlays;
	const showButton = Boolean(running) || canStartSlideshow(photoItems, currentIndex, videosOn);

	const photoUrl = currentPhoto
		? getImageUrl(
			currentPhoto._serverUrl || serverUrl,
			currentPhoto.Id,
			'Primary',
			{maxWidth: 1920, maxHeight: 1080, quality: 90}
		)
		: null;

	const currentLayer = photoUrl ? {id: currentId, url: photoUrl, alt: currentPhoto.Name || ''} : null;
	useEffect(() => {
		if (!currentLayer) return;
		setLayers(prev => (prev.some(layer => layer.id === currentLayer.id) ? prev : prev.slice(-2).concat(currentLayer)));
	}, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

	// Once the photo has appeared (or failed) the ones behind it have faded out and are dropped.
	useEffect(() => {
		if (!settled) return undefined;
		const timer = setTimeout(() => {
			setLayers(prev => (prev.length > 1 ? prev.filter(layer => layer.id === currentId) : prev));
			setLoaded(prev => (Object.keys(prev).length > 1 ? {[currentId]: prev[currentId]} : prev));
		}, FADE_MS + 100);
		return () => clearTimeout(timer);
	}, [settled, currentId]);

	// The next two and the previous photo are fetched ahead. The images are held here, since one nothing
	// refers to can be dropped before it's used, and the photo is then fetched again.
	const preloadedRef = useRef({});
	useEffect(() => {
		if (photoItems.length === 0) return;
		const kept = {};
		[1, 2, -1].forEach((offset) => {
			const idx = (currentIndex + offset + photoItems.length * 2) % photoItems.length;
			const pItem = photoItems[idx];
			if (!pItem || idx === currentIndex || pItem.Type === 'Video') return;
			kept[pItem.Id] = preloadedRef.current[pItem.Id] || (() => {
				const img = new window.Image();
				img.src = getImageUrl(
					pItem._serverUrl || serverUrl,
					pItem.Id,
					'Primary',
					{maxWidth: 1920, maxHeight: 1080, quality: 90}
				);
				return img;
			})();
		});
		preloadedRef.current = kept;
	}, [currentIndex, photoItems, serverUrl]);

	const resetInfoTimer = useCallback(() => {
		setShowInfo(true);
		if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
		infoTimerRef.current = setTimeout(() => setShowInfo(false), 4000);
	}, []);

	// Up and down bring the controls up, or close them when they're already up.
	const showInfoRef = useRef(true);
	showInfoRef.current = showInfo;
	const toggleControls = useCallback(() => {
		if (!showInfoRef.current) {
			resetInfoTimer();
			return;
		}
		if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
		setShowInfo(false);
	}, [resetInfoTimer]);

	useEffect(() => {
		resetInfoTimer();
		return () => {
			if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Whether the photo on screen was stepped onto, as opposed to the viewer opening on it.
	// An auto advance and the left and right keys leave the controls as they are, so a running slideshow doesn't flash the info on every photo.
	const currentIndexRef = useRef(currentIndex);
	currentIndexRef.current = currentIndex;
	const hasMore = moreCount > 0;
	// A step forward from the last photo loaded while the folder has more waits for them, instead of wrapping to the start.
	const pendingStepRef = useRef(null);
	const step = useCallback((dir, auto) => {
		if (photoItems.length <= 1 && !hasMore) return;
		if (dir > 0 && hasMore && currentIndexRef.current === photoItems.length - 1) {
			if (!pendingStepRef.current) {
				pendingStepRef.current = {auto: auto === true, length: photoItems.length};
				if (onNeedMore) onNeedMore();
			}
			return;
		}
		if (photoItems.length <= 1) return;
		steppedRef.current = true;
		setCurrentIndex(prev => stepIndex(photoItems, prev, dir, {skipVideos: auto === true && !videosOn}));
	}, [photoItems, videosOn, hasMore, onNeedMore]);

	const goNext = useCallback(() => step(1), [step]);
	const goPrev = useCallback(() => step(-1), [step]);
	const advance = useCallback(() => step(1, true), [step]);

	// Reading on through the folder: more is asked for as the end of what's loaded gets near, and a step that
	// was waiting for it goes ahead once it has arrived, or once there turns out to be no more.
	useEffect(() => {
		if (!hasMore || !onNeedMore) return;
		const pending = pendingStepRef.current;
		if (pending && photoItems.length > pending.length) {
			pendingStepRef.current = null;
			step(1, pending.auto);
		} else if (pending || currentIndex >= photoItems.length - PREFETCH_AHEAD) {
			onNeedMore();
		}
	}, [currentIndex, photoItems.length, moreCount]); // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (hasMore || !pendingStepRef.current) return;
		const pending = pendingStepRef.current;
		pendingStepRef.current = null;
		step(1, pending.auto);
	}, [hasMore]); // eslint-disable-line react-hooks/exhaustive-deps

	usePhotoSlideshow({
		active: Boolean(running) && !playsVideo,
		itemId: currentPhoto ? currentPhoto.Id : null,
		settled,
		fadeMs: imageFailed ? 0 : undefined,
		intervalMs,
		onAdvance: advance
	});

	useEffect(() => {
		if (autoPlays && onPlayVideo) onPlayVideo(currentPhoto, currentIndex);
	}, [autoPlays, currentPhoto && currentPhoto.Id]); // eslint-disable-line react-hooks/exhaustive-deps

	// A running slideshow on a photo keeps the TV from dimming or starting its own screensaver. The player does the same for a video.
	const keepAwake = Boolean(running) && !playsVideo;
	useEffect(() => {
		if (!keepAwake) return undefined;
		let released = false;
		initVideo().then(() => { if (!released) return keepScreenOn(true); }).catch(() => {});
		return () => {
			released = true;
			try { keepScreenOn(false); } catch (e) { /* impl never loaded */ }
		};
	}, [keepAwake]);

	const toggleSlideshow = useCallback(() => {
		if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
		setShowInfo(false);
		if (onSlideshowChange) onSlideshowChange(!running);
	}, [running, onSlideshowChange]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			const key = e.keyCode;
			if (key === KEYS.BACK || key === KEYS.ESCAPE || key === KEYS.BACKSPACE) {
				e.preventDefault();
				e.stopPropagation();
				// Back closes the controls first, and the viewer once they're gone.
				if (showInfo) {
					toggleControls();
				} else {
					onClose?.(currentPhoto);
				}
			} else if (key === 39) {
				e.preventDefault();
				e.stopPropagation();
				goNext();
			} else if (key === 37) {
				e.preventDefault();
				e.stopPropagation();
				goPrev();
			} else if (key === 13 || key === 32) {
				e.preventDefault();
				e.stopPropagation();
				if (e.repeat) return;
				if (!showButton) {
					setShowInfo(prev => !prev);
				} else if (showInfo) {
					toggleSlideshow();
				} else {
					resetInfoTimer();
				}
			} else if (key === KEYS.UP || key === KEYS.DOWN) {
				// Up and down only bring the controls up or close them, and taking them keeps focus from wandering behind the viewer.
				e.preventDefault();
				e.stopPropagation();
				toggleControls();
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [onClose, currentPhoto, goNext, goPrev, showButton, showInfo, toggleSlideshow, resetInfoTimer, toggleControls]);

	// A photo from the cache loads before the browser has drawn it hidden, and would then show without a fade.
	// Reading the layout settles its style first.
	const handleImageLoad = useCallback((ev) => {
		const id = ev.currentTarget.dataset.id;
		void ev.currentTarget.offsetWidth;
		setLoaded(prev => (prev[id] === 'ok' ? prev : {...prev, [id]: 'ok'}));
	}, []);

	const handleImageError = useCallback((ev) => {
		const id = ev.currentTarget.dataset.id;
		setLoaded(prev => (prev[id] === 'failed' ? prev : {...prev, [id]: 'failed'}));
	}, []);

	const handleButtonClick = useCallback((e) => {
		e.stopPropagation();
		toggleSlideshow();
	}, [toggleSlideshow]);

	// Pointing brings the button up, since the Magic Remote has no OK to ask for it.
	const handlePointerMove = useCallback(() => {
		if (!showButton) return;
		const now = Date.now();
		if (now - pointerAtRef.current < 500) return;
		pointerAtRef.current = now;
		resetInfoTimer();
	}, [showButton, resetInfoTimer]);

	if (!currentPhoto) return null;

	const photoDate = currentPhoto.PremiereDate || currentPhoto.DateCreated;
	const formattedDate = photoDate ? new Date(photoDate).toLocaleDateString(uiLocale(), {
		year: 'numeric', month: 'long', day: 'numeric'
	}) : null;

	const dimensions = currentPhoto.Width && currentPhoto.Height
		? currentPhoto.Width + ' × ' + currentPhoto.Height
		: null;

	return (
		<div className={css.viewer} onMouseMove={handlePointerMove}>
			<div className={css.imageContainer}>
				{(autoPlays ? [] : (currentLayer && !layers.some(layer => layer.id === currentId) ? layers.concat(currentLayer) : layers)).map(layer => (
					<img
						key={layer.id}
						src={layer.url}
						alt={layer.alt}
						className={css.photo + ((layer.id === currentId ? imageLoaded : !settled && layer.id === lastShownRef.current) ? ' ' + css.photoLoaded : '')}
						data-id={layer.id}
						onLoad={handleImageLoad}
						onError={handleImageError}
					/>
				))}
				{!settled && !autoPlays && (
					<div className={css.loading}>
						<div className={css.spinner} />
					</div>
				)}
				{imageFailed && (
					<div className={css.broken}>
						<div className={css.brokenIcon} />
						<div>{$L('This photo can\'t be shown')}</div>
					</div>
				)}
			</div>

			<div className={css.infoOverlay + (showInfo && !autoPlays ? ' ' + css.infoVisible : '')}>
				<div className={css.topBar}>
					{photoItems.length > 1 && (
						<div className={css.counter}>
							{currentIndex + 1} / {photoItems.length + moreCount}
						</div>
					)}
				</div>
				<div className={css.bottomBar}>
					<div className={css.photoName}>{currentPhoto.Name || ''}</div>
					{formattedDate && <div className={css.photoDate}>{formattedDate}</div>}
					{dimensions && <div className={css.photoMeta}>{dimensions}</div>}
					{showButton && (
						<div className={css.slideshowButton} role="button" onClick={handleButtonClick}>
							<span className={running ? css.pauseIcon : css.playIcon} />
							<span>{$L('Slideshow')}</span>
						</div>
					)}
					{photoItems.length > 1 && (
					<div className={css.navHint}>{$L('◀ ▶ Navigate')} &nbsp; {showButton ? $L('OK Slideshow') : $L('OK Toggle info')} &nbsp; {$L('Back Close')}</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default PhotoViewer;
