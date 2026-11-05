import {useState, useEffect, useCallback, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import {isBackKey, KEYS} from '../../utils/keys';
import {fetchBook, loadScript, startPage} from '../../utils/books';
import {FIXED_LAYOUT_INVERT_KEY} from '../../utils/readerSettings';
import {ModalContainer} from '../../utils/spotlightContainers';
import {getFromStorage, saveToStorage} from '../../services/storage';
import {CORE_ICON_PATHS} from '../../views/Settings/settingsCoreIcons';
import useBookProgress from '../../hooks/useBookProgress';
import useReturnFocus from '../../hooks/useReturnFocus';
import {ChromeButton} from '../EpubReader/ReaderPanels';
import viewerCss from '../ComicViewer/ComicViewer.module.less';
import menuCss from '../EpubReader/EpubReader.module.less';
import css from './PdfReader.module.less';

const loadPdfJs = () => loadScript('reader/pdf.min.js').then(() => {
	window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'reader/pdf.worker.min.js';
	return window.pdfjsLib;
});

const PdfReader = ({item, serverUrl, accessToken, onClose}) => {
	const [doc, setDoc] = useState(null);
	const [currentPage, setCurrentPage] = useState(0);
	const [loading, setLoading] = useState(true);
	const [rendering, setRendering] = useState(false);
	const [error, setError] = useState(null);
	const [showInfo, setShowInfo] = useState(true);
	const [chrome, setChrome] = useState(false);
	const [invert, setInvert] = useState(false);
	const canvasRef = useRef(null);
	const infoTimerRef = useRef(null);
	const count = doc ? doc.numPages : 0;

	useBookProgress(item, currentPage, count);
	useReturnFocus(chrome);

	useEffect(() => {
		if (chrome) Spotlight.focus('pdf-invert');
	}, [chrome]);

	useEffect(() => {
		if (!item) return;
		let cancelled = false;
		let opened = null;
		const open = async () => {
			try {
				const [lib, buffer, storedInvert] = await Promise.all([
					loadPdfJs(),
					fetchBook(item, serverUrl, accessToken),
					getFromStorage(FIXED_LAYOUT_INVERT_KEY).catch(() => null)
				]);
				// Fonts compiled to code are how CVE-2024-4367 runs script, so they're
				// drawn without it.
				opened = await lib.getDocument({data: new Uint8Array(buffer), isEvalSupported: false}).promise;
				if (cancelled) {
					opened.destroy();
					return;
				}
				setInvert(storedInvert === true);
				setDoc(opened);
				setCurrentPage(startPage(item, opened.numPages));
				setLoading(false);
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
			if (opened) opened.destroy();
		};
	}, [item, serverUrl, accessToken]);

	useEffect(() => {
		if (!doc) return;
		let cancelled = false;
		let task = null;
		setRendering(true);
		doc.getPage(currentPage + 1).then((page) => {
			if (cancelled) return;
			const canvas = canvasRef.current;
			const natural = page.getViewport({scale: 1});
			const fit = Math.min(window.innerWidth / natural.width, window.innerHeight / natural.height);
			const ratio = window.devicePixelRatio || 1;
			const viewport = page.getViewport({scale: fit * ratio});
			canvas.width = Math.floor(viewport.width);
			canvas.height = Math.floor(viewport.height);
			canvas.style.width = Math.floor(viewport.width / ratio) + 'px';
			canvas.style.height = Math.floor(viewport.height / ratio) + 'px';
			task = page.render({canvasContext: canvas.getContext('2d'), viewport});
			return task.promise;
		}).then(() => {
			if (!cancelled) setRendering(false);
		}, (err) => {
			if (!cancelled && !(err && err.name === 'RenderingCancelledException')) setError($L('Failed to open book'));
		});
		return () => {
			cancelled = true;
			if (task) task.cancel();
		};
	}, [doc, currentPage]);

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

	const turn = useCallback((step) => {
		setCurrentPage(prev => Math.min(Math.max(prev + step, 0), Math.max(count - 1, 0)));
		resetInfoTimer();
	}, [count, resetInfoTimer]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			const key = e.keyCode;
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				if (chrome) setChrome(false);
				else onClose?.();
				return;
			}
			// The menu is walked with the remote like any other screen.
			if (chrome) return;
			if (key === KEYS.RIGHT || key === KEYS.DOWN) {
				e.preventDefault();
				e.stopPropagation();
				turn(1);
			} else if (key === KEYS.LEFT || key === KEYS.UP) {
				e.preventDefault();
				e.stopPropagation();
				turn(-1);
			} else if (key === KEYS.ENTER || key === KEYS.SPACE) {
				e.preventDefault();
				e.stopPropagation();
				if (doc) setChrome(true);
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [onClose, turn, chrome, doc]);

	const toggleInvert = useCallback(() => {
		setInvert(!invert);
		saveToStorage(FIXED_LAYOUT_INVERT_KEY, !invert).catch(() => {});
	}, [invert]);

	return (
		<div className={viewerCss.viewer}>
			<div className={viewerCss.imageContainer}>
				<canvas ref={canvasRef} className={css.page + (invert ? ' ' + viewerCss.inverted : '')} />
			</div>
			{rendering && !loading && !error && (
				<div className={viewerCss.loading}>
					<div className={viewerCss.spinner} />
				</div>
			)}
			{(loading || error) && (
				<div className={css.cover}>
					<div className={viewerCss.loadingContainer}>
						{loading && <div className={viewerCss.spinner} />}
						<div className={error ? viewerCss.errorText : viewerCss.loadingText}>{error || $L('Opening book...')}</div>
						{error && <div className={viewerCss.loadingText}>{$L('Press Back to close')}</div>}
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
							{currentPage + 1} / {count}
						</div>
						<div className={viewerCss.navHint}>{'◀ ▶ ' + $L('Navigate')} &nbsp; {'OK ' + $L('Menu')} &nbsp; {$L('Back') + ' ' + $L('Close')}</div>
					</div>
				</div>
			)}
			{chrome && (
				<ModalContainer className={menuCss.chrome} spotlightId="pdf-chrome">
					<div className={menuCss.chromeTop}>
						<div className={menuCss.chromeTitle}>{item.Name || $L('Book')}</div>
						<ChromeButton icon={CORE_ICON_PATHS.invert_colors} label={$L('Invert Colors (fixed layout)')} spotlightId="pdf-invert" onClick={toggleInvert} />
					</div>
				</ModalContainer>
			)}
		</div>
	);
};

export default PdfReader;
