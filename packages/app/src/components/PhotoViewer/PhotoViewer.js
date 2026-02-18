import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {getImageUrl} from '../../utils/helpers';
import css from './PhotoViewer.module.less';

const PhotoViewer = ({item, items, serverUrl, onClose}) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [showInfo, setShowInfo] = useState(true);
	const [imageLoaded, setImageLoaded] = useState(false);
	const infoTimerRef = useRef(null);

	const photoItems = useMemo(() => {
		if (items && items.length > 0) {
			return items.filter(i => i.Type === 'Photo' || i.Type === 'Video');
		}
		return item ? [item] : [];
	}, [items, item]);

	useEffect(() => {
		if (!item || photoItems.length === 0) return;
		const idx = photoItems.findIndex(i => i.Id === item.Id);
		setCurrentIndex(idx >= 0 ? idx : 0);
	}, [item]);  // eslint-disable-line react-hooks/exhaustive-deps

	const currentPhoto = photoItems[currentIndex];

	const photoUrl = currentPhoto
		? getImageUrl(
			currentPhoto._serverUrl || serverUrl,
			currentPhoto.Id,
			'Primary',
			{maxWidth: 1920, maxHeight: 1080, quality: 90}
		)
		: null;

	useEffect(() => {
		if (photoItems.length === 0) return;
		const nextIdx = (currentIndex + 1) % photoItems.length;
		const prevIdx = (currentIndex - 1 + photoItems.length) % photoItems.length;
		const nextItem = photoItems[nextIdx];
		const prevItem = photoItems[prevIdx];

		const preload = (pItem) => {
			if (!pItem) return;
			const img = new window.Image();
			img.src = getImageUrl(
				pItem._serverUrl || serverUrl,
				pItem.Id,
				'Primary',
				{maxWidth: 1920, maxHeight: 1080, quality: 90}
			);
		};

		if (nextItem && nextIdx !== currentIndex) preload(nextItem);
		if (prevItem && prevIdx !== currentIndex) preload(prevItem);
	}, [currentIndex, photoItems, serverUrl]);

	const resetInfoTimer = useCallback(() => {
		setShowInfo(true);
		if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
		infoTimerRef.current = setTimeout(() => setShowInfo(false), 4000);
	}, []);

	useEffect(() => {
		resetInfoTimer();
		return () => {
			if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
		};
	}, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

	const goNext = useCallback(() => {
		if (photoItems.length <= 1) return;
		setImageLoaded(false);
		setCurrentIndex(prev => (prev + 1) % photoItems.length);
		resetInfoTimer();
	}, [photoItems.length, resetInfoTimer]);

	const goPrev = useCallback(() => {
		if (photoItems.length <= 1) return;
		setImageLoaded(false);
		setCurrentIndex(prev => (prev - 1 + photoItems.length) % photoItems.length);
		resetInfoTimer();
	}, [photoItems.length, resetInfoTimer]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			const key = e.keyCode;
			if (key === 461 || key === 27 || key === 8) {
				e.preventDefault();
				e.stopPropagation();
				onClose?.();
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
				setShowInfo(prev => !prev);
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [onClose, goNext, goPrev]);

	const handleImageLoad = useCallback(() => {
		setImageLoaded(true);
	}, []);

	if (!currentPhoto) return null;

	const photoDate = currentPhoto.PremiereDate || currentPhoto.DateCreated;
	const formattedDate = photoDate ? new Date(photoDate).toLocaleDateString(undefined, {
		year: 'numeric', month: 'long', day: 'numeric'
	}) : null;

	const dimensions = currentPhoto.Width && currentPhoto.Height
		? currentPhoto.Width + ' × ' + currentPhoto.Height
		: null;

	return (
		<div className={css.viewer}>
			<div className={css.imageContainer}>
				{photoUrl && (
					<img
						key={currentPhoto.Id}
						src={photoUrl}
						alt={currentPhoto.Name || ''}
						className={css.photo + (imageLoaded ? ' ' + css.photoLoaded : '')}
						onLoad={handleImageLoad}
					/>
				)}
				{!imageLoaded && (
					<div className={css.loading}>
						<div className={css.spinner} />
					</div>
				)}
			</div>

			<div className={css.infoOverlay + (showInfo ? ' ' + css.infoVisible : '')}>
				<div className={css.topBar}>
					{photoItems.length > 1 && (
						<div className={css.counter}>
							{currentIndex + 1} / {photoItems.length}
						</div>
					)}
				</div>
				<div className={css.bottomBar}>
					<div className={css.photoName}>{currentPhoto.Name || ''}</div>
					{formattedDate && <div className={css.photoDate}>{formattedDate}</div>}
					{dimensions && <div className={css.photoMeta}>{dimensions}</div>}
					{photoItems.length > 1 && (
						<div className={css.navHint}>◀ ▶ Navigate &nbsp; OK Toggle info &nbsp; Back Close</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default PhotoViewer;
