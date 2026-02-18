import {useState, useEffect, useRef, useCallback} from 'react';
import {getImageUrl, getBackdropId, getLogoUrl} from '../../utils/helpers';
import * as jellyfinApi from '../../services/jellyfinApi';
import css from './Screensaver.module.less';

const LOGO_WIDTH = 400;
const LOGO_HEIGHT = 200;
const CLOCK_WIDTH = 200;
const CLOCK_HEIGHT = 60;
const MARGIN = 20;
const VELOCITY = 0.5;
const FRAME_DELAY = 16;
const BACKDROP_INTERVAL = 30000;
const BACKDROP_BATCH_SIZE = 20;

const BACKDROP_QUERY = {
	IncludeItemTypes: 'Movie,Series',
	Recursive: true,
	SortBy: 'Random',
	Limit: BACKDROP_BATCH_SIZE,
	Fields: 'ImageTags,ParentLogoImageTag,ParentLogoItemId,ParentBackdropImageTags,ParentBackdropItemId,BackdropImageTags',
	HasBackdrop: true,
	ExcludeItemTypes: 'BoxSet',
	ImageTypes: 'Backdrop'
};

const startBounce = (ref, animRef, width, height) => {
	const screenWidth = window.innerWidth;
	const screenHeight = window.innerHeight;

	let x = Math.random() * (screenWidth - width - 2 * MARGIN) + MARGIN;
	let y = Math.random() * (screenHeight - height - 2 * MARGIN) + MARGIN;
	let vx = Math.random() > 0.5 ? VELOCITY : -VELOCITY;
	let vy = Math.random() > 0.5 ? VELOCITY : -VELOCITY;
	let running = true;

	const animate = () => {
		if (!running) return;

		x += vx;
		y += vy;

		const maxX = screenWidth - width - MARGIN;
		const maxY = screenHeight - height - MARGIN;

		if (x <= MARGIN) { x = MARGIN; vx = -vx; }
		else if (x >= maxX) { x = maxX; vx = -vx; }

		if (y <= MARGIN) { y = MARGIN; vy = -vy; }
		else if (y >= maxY) { y = maxY; vy = -vy; }

		if (ref.current) {
			ref.current.style.transform = 'translate(' + Math.round(x) + 'px, ' + Math.round(y) + 'px)';
		}

		animRef.current = setTimeout(animate, FRAME_DELAY);
	};

	animate();

	return () => {
		running = false;
		if (animRef.current) clearTimeout(animRef.current);
	};
};

const formatTime = (clockDisplay) => {
	const now = new Date();
	const h = now.getHours();
	const m = now.getMinutes();
	if (clockDisplay === '12-hour') {
		const ampm = h >= 12 ? 'PM' : 'AM';
		const h12 = h % 12 || 12;
		return `${h12}:${m < 10 ? '0' : ''}${m} ${ampm}`;
	}
	return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
};

const Screensaver = ({visible, mode = 'library', dimmingLevel = 50, showClock = true, clockDisplay = '24-hour', onDismiss, serverUrl}) => {
	const [rendered, setRendered] = useState(false);
	const [showOverlay, setShowOverlay] = useState(false);
	const [clockText, setClockText] = useState(() => formatTime(clockDisplay));
	const logoAnimRef = useRef(null);
	const clockAnimRef = useRef(null);
	const logoRef = useRef(null);
	const clockRef = useRef(null);

	const [currentItem, setCurrentItem] = useState(null);
	const [backdropVisible, setBackdropVisible] = useState(false);
	const [batchReady, setBatchReady] = useState(false);
	const backdropTimerRef = useRef(null);
	const backdropBatchRef = useRef([]);
	const backdropUsedRef = useRef(0);

	useEffect(() => {
		if (visible) {
			setRendered(true);
			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(() => {
					setShowOverlay(true);
				});
			});
		} else {
			setShowOverlay(false);
			setCurrentItem(null);
			setBackdropVisible(false);
			setBatchReady(false);
			backdropBatchRef.current = [];
			backdropUsedRef.current = 0;
			const timer = setTimeout(() => setRendered(false), 1000);
			return () => clearTimeout(timer);
		}
	}, [visible]);

	useEffect(() => {
		if (!visible || !showClock) return;
		const interval = setInterval(() => {
			setClockText(formatTime(clockDisplay));
		}, 1000);
		return () => clearInterval(interval);
	}, [visible, showClock, clockDisplay]);

	useEffect(() => {
		if (!visible || mode !== 'library' || !serverUrl) return;
		let cancelled = false;

		const fetchItems = async () => {
			try {
				const result = await jellyfinApi.api.getItems(BACKDROP_QUERY);
				if (cancelled) return;
				const items = (result?.Items || []).filter(item => getBackdropId(item));
				if (items.length > 0) {
					backdropBatchRef.current = items;
					backdropUsedRef.current = 0;
					setCurrentItem(items[0]);
					setBatchReady(true);
					setTimeout(() => {
						if (!cancelled) setBackdropVisible(true);
					}, 500);
				}
			} catch (err) {
				console.error('[Screensaver] Failed to fetch backdrop items:', err);
			}
		};

		const initialTimer = setTimeout(fetchItems, 2000);
		return () => {
			cancelled = true;
			clearTimeout(initialTimer);
		};
	}, [visible, mode, serverUrl]);

	useEffect(() => {
		if (!visible || mode !== 'library' || !serverUrl || !batchReady) return;

		const cycle = async () => {
			backdropUsedRef.current += 1;
			const batch = backdropBatchRef.current;

			if (backdropUsedRef.current >= batch.length) {
				try {
					const result = await jellyfinApi.api.getItems(BACKDROP_QUERY);
					const items = (result?.Items || []).filter(item => getBackdropId(item));
					if (items.length > 0) {
						backdropBatchRef.current = items;
						backdropUsedRef.current = 0;
					} else {
						backdropUsedRef.current = 0;
					}
				} catch (err) {
					backdropUsedRef.current = 0;
				}
			}

			const nextItem = backdropBatchRef.current[backdropUsedRef.current];
			if (nextItem) {
				setBackdropVisible(false);
				setTimeout(() => {
					setCurrentItem(nextItem);
					setTimeout(() => setBackdropVisible(true), 100);
				}, 1000);
			}
		};

		backdropTimerRef.current = setInterval(cycle, BACKDROP_INTERVAL);
		return () => {
			if (backdropTimerRef.current) {
				clearInterval(backdropTimerRef.current);
			}
		};
	}, [visible, mode, serverUrl, batchReady]);

	useEffect(() => {
		if (!visible || mode !== 'logo' || !logoRef.current) return;
		return startBounce(logoRef, logoAnimRef, LOGO_WIDTH, LOGO_HEIGHT);
	}, [visible, mode, rendered]);

	useEffect(() => {
		if (!visible || mode !== 'logo' || !showClock || !clockRef.current) return;
		return startBounce(clockRef, clockAnimRef, CLOCK_WIDTH, CLOCK_HEIGHT);
	}, [visible, mode, showClock, rendered]);

	const handleInteraction = useCallback((e) => {
		e.preventDefault();
		e.stopPropagation();
		if (onDismiss) onDismiss();
	}, [onDismiss]);

	if (!rendered) return null;

	const dimmingAlpha = Math.max(0, Math.min(100, dimmingLevel)) / 100;
	const clockAlpha = 1 - (dimmingAlpha * 0.7);

	const backdropId = currentItem ? getBackdropId(currentItem) : null;
	const backdropUrl = backdropId ? getImageUrl(serverUrl, backdropId, 'Backdrop', {maxWidth: 1920, quality: 80}) : null;
	const itemLogoUrl = currentItem ? getLogoUrl(serverUrl, currentItem, {maxWidth: 400, quality: 90}) : null;

	return (
		<div
			className={css.overlay + ' ' + (showOverlay ? css.overlayVisible : '')}
			onClick={handleInteraction}
			onKeyDown={handleInteraction}
		>
			{mode === 'library' && (
				<div className={css.backdropContainer}>
					{backdropUrl && (
						<div
							className={css.backdropImage + ' ' + (backdropVisible ? css.backdropImageVisible : '')}
							style={{backgroundImage: 'url(' + backdropUrl + ')'}}
						/>
					)}
					<div className={css.backdropVignette} />
					{currentItem && backdropVisible && itemLogoUrl && (
						<div className={css.backdropInfo}>
							<img
								src={itemLogoUrl}
								alt={currentItem.Name || ''}
								className={css.backdropLogo}
							/>
						</div>
					)}
				</div>
			)}

			{mode === 'logo' && (
				<div
					ref={logoRef}
					className={css.logoContainer}
				>
					<img
						src="resources/banner-dark.png"
						alt="Moonfin"
						className={css.logo}
					/>
				</div>
			)}

			{mode === 'library' && !backdropUrl && (
				<div className={css.logoContainerCentered}>
					<img
						src="resources/banner-dark.png"
						alt="Moonfin"
						className={css.logo}
					/>
				</div>
			)}

			{dimmingLevel > 0 && (
				<div
					className={css.dimmingLayer}
					style={{opacity: dimmingAlpha}}
				/>
			)}

			{showClock && (
				<div
					ref={mode === 'logo' ? clockRef : null}
					className={mode === 'logo' ? css.clock : css.clockFixed}
					style={{opacity: clockAlpha}}
				>
					{clockText}
				</div>
			)}
		</div>
	);
};

export default Screensaver;
