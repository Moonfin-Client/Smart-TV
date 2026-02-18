import {useState, useEffect, useCallback, useRef} from 'react';
import JSZip from 'jszip';
import css from './ComicViewer.module.less';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'jpe', 'jif', 'jfif', 'png', 'avif', 'gif', 'bmp', 'tiff', 'tif', 'webp'];

const ComicViewer = ({item, serverUrl, accessToken, onClose}) => {
	const [pages, setPages] = useState([]);
	const [currentPage, setCurrentPage] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [imageLoaded, setImageLoaded] = useState(false);
	const [showInfo, setShowInfo] = useState(true);
	const infoTimerRef = useRef(null);
	const blobUrlsRef = useRef([]);

	useEffect(() => {
		if (!item) return;

		let cancelled = false;
		const extract = async () => {
			try {
				setLoading(true);
				setError(null);

				const baseUrl = item._serverUrl || serverUrl;
				const token = item._serverAccessToken || accessToken;
				const downloadUrl = `${baseUrl}/Items/${item.Id}/Download?api_key=${encodeURIComponent(token)}`;

				const response = await fetch(downloadUrl);
				if (!response.ok) throw new Error('Download failed');

				const arrayBuffer = await response.arrayBuffer();
				const zip = await JSZip.loadAsync(arrayBuffer);

				const imageFiles = [];
				zip.forEach((path, entry) => {
					if (entry.dir) return;
					const ext = path.split('.').pop().toLowerCase();
					if (IMAGE_EXTENSIONS.includes(ext)) {
						imageFiles.push({path, entry});
					}
				});

				imageFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, {numeric: true}));

				const urls = [];
				for (const file of imageFiles) {
					if (cancelled) return;
					const blob = await file.entry.async('blob');
					urls.push(URL.createObjectURL(blob));
				}

				if (cancelled) {
					urls.forEach(u => URL.revokeObjectURL(u));
					return;
				}

				blobUrlsRef.current = urls;
				setPages(urls);
				setLoading(false);

				const startPage = item.UserData?.PlaybackPositionTicks
					? Math.floor(item.UserData.PlaybackPositionTicks / 10000)
					: 0;
				if (startPage > 0 && startPage < urls.length) {
					setCurrentPage(startPage);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err.message || 'Failed to open comic');
					setLoading(false);
				}
			}
		};

		extract();
		return () => {
			cancelled = true;
		};
	}, [item, serverUrl, accessToken]);

	useEffect(() => {
		return () => {
			blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
			blobUrlsRef.current = [];
		};
	}, []);

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
	}, [currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

	const goNext = useCallback(() => {
		if (pages.length <= 1) return;
		setImageLoaded(false);
		setCurrentPage(prev => Math.min(prev + 1, pages.length - 1));
		resetInfoTimer();
	}, [pages.length, resetInfoTimer]);

	const goPrev = useCallback(() => {
		if (pages.length <= 1) return;
		setImageLoaded(false);
		setCurrentPage(prev => Math.max(prev - 1, 0));
		resetInfoTimer();
	}, [pages.length, resetInfoTimer]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			const key = e.keyCode;
			if (key === 461 || key === 27 || key === 8) {
				e.preventDefault();
				e.stopPropagation();
				onClose?.();
			} else if (key === 39 || key === 40) {
				e.preventDefault();
				e.stopPropagation();
				goNext();
			} else if (key === 37 || key === 38) {
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

	if (loading) {
		return (
			<div className={css.viewer}>
				<div className={css.loadingContainer}>
					<div className={css.spinner} />
					<div className={css.loadingText}>Opening comic...</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={css.viewer}>
				<div className={css.loadingContainer}>
					<div className={css.errorText}>{error}</div>
					<div className={css.loadingText}>Press Back to close</div>
				</div>
			</div>
		);
	}

	if (pages.length === 0) {
		return (
			<div className={css.viewer}>
				<div className={css.loadingContainer}>
					<div className={css.errorText}>No pages found</div>
					<div className={css.loadingText}>Press Back to close</div>
				</div>
			</div>
		);
	}

	return (
		<div className={css.viewer}>
			<div className={css.imageContainer}>
				<img
					key={currentPage}
					src={pages[currentPage]}
					alt={`Page ${currentPage + 1}`}
					className={css.page + (imageLoaded ? ' ' + css.pageLoaded : '')}
					onLoad={handleImageLoad}
				/>
				{!imageLoaded && (
					<div className={css.loading}>
						<div className={css.spinner} />
					</div>
				)}
			</div>

			<div className={css.infoOverlay + (showInfo ? ' ' + css.infoVisible : '')}>
				<div className={css.topBar}>
					<div className={css.title}>{item.Name || 'Comic'}</div>
				</div>
				<div className={css.bottomBar}>
					<div className={css.pageCounter}>
						{currentPage + 1} / {pages.length}
					</div>
					<div className={css.navHint}>◀ ▶ Navigate &nbsp; OK Toggle info &nbsp; Back Close</div>
				</div>
			</div>
		</div>
	);
};

export default ComicViewer;
