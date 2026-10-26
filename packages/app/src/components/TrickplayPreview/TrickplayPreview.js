import {useState, useEffect, useLayoutEffect, useReducer, useRef} from 'react';
import * as jellyfinApi from '../../services/jellyfinApi';
import {plexTrickplayFrameUrl} from '../../utils/plexUrls';
import {planSeekSheetIndexes, trickplayTile} from '../../utils/trickplaySheets';
import {VERTICAL_TRAVEL_TOP_MARGIN, planTrickplayPreview} from '../../utils/trickplayLayout';

import css from './TrickplayPreview.module.less';

export const getTrickplayManifest = async (itemId, mediaSourceId) => {
    if (jellyfinApi.getServerType() === 'plex') return jellyfinApi.api.getTrickplayManifest(itemId, mediaSourceId).catch(() => null);
    try {
        const serverUrl = jellyfinApi.getServerUrl();
        const apiKey = jellyfinApi.getApiKey();

        const response = await fetch(
            `${serverUrl}${jellyfinApi.userRoutes.item(itemId)}Fields=Trickplay&${jellyfinApi.getTokenParam()}=${apiKey}`
        );

        if (!response.ok) return null;

        const data = await response.json();
        return data?.Trickplay?.[mediaSourceId] || null;
    } catch {
        return null;
    }
};

// Manifests are kept per item and source for the session, so a preview that comes and goes with
// the controls asks the server once.
const MANIFEST_CAP = 20;
const manifests = new Map();
const manifestKey = (itemId, mediaSourceId) => `${itemId}|${mediaSourceId}`;

const loadTrickplayManifest = (itemId, mediaSourceId) => {
	const key = manifestKey(itemId, mediaSourceId);
	let entry = manifests.get(key);
	if (!entry) {
		if (manifests.size >= MANIFEST_CAP) manifests.delete(manifests.keys().next().value);
		entry = {value: null};
		entry.promise = getTrickplayManifest(itemId, mediaSourceId).then((manifest) => {
			entry.value = manifest;
			return manifest;
		});
		manifests.set(key, entry);
	}
	return entry.promise;
};

// True once the item's manifest is in and has thumbnails, which is when scrubbing has a preview.
export const hasTrickplayPreview = (itemId, mediaSourceId) =>
	Boolean(manifests.get(manifestKey(itemId, mediaSourceId))?.value);

// Sheets that have finished loading, and the ones still on their way with whoever is waiting on
// them. Holding the Image keeps a pending load from being dropped before it lands.
const SHEET_MEMORY = 64;
const loadedSheets = new Set();
const pendingSheets = new Map();

const whenSheetLoaded = (url, onLoaded) => {
	if (loadedSheets.has(url)) {
		onLoaded?.();
		return;
	}
	const pending = pendingSheets.get(url);
	if (pending) {
		if (onLoaded) pending.waiting.add(onLoaded);
		return;
	}
	const image = new window.Image();
	const entry = {image, waiting: new Set(onLoaded ? [onLoaded] : [])};
	pendingSheets.set(url, entry);
	image.onload = () => {
		pendingSheets.delete(url);
		if (loadedSheets.size >= SHEET_MEMORY) loadedSheets.delete(loadedSheets.values().next().value);
		loadedSheets.add(url);
		entry.waiting.forEach((callback) => callback());
	};
	// A failed sheet isn't remembered, so a later pass can try it again.
	image.onerror = () => pendingSheets.delete(url);
	image.src = url;
};

const pickWidth = (manifest, preferredWidth) => {
	const widths = Object.keys(manifest).map(Number).sort((a, b) => a - b);
	let best = widths[0];
	for (const w of widths) {
		if (w <= preferredWidth) best = w;
	}
	return best;
};

const sheetUrl = (itemId, mediaSourceId, width, imageIndex, info) => (info?.PlexPartId
	? plexTrickplayFrameUrl(jellyfinApi.getServerUrl(), info, imageIndex)
	: `${jellyfinApi.getServerUrl()}/Videos/${itemId}/Trickplay/${width}/${imageIndex}.jpg?MediaSourceId=${mediaSourceId}&ApiKey=${jellyfinApi.getApiKey()}`);

// The sheet's crop scaled so the wanted thumbnail fills a box of the given size.
const spriteStyle = (url, tile, width, height) => {
	const scaleX = width / tile.width;
	const scaleY = height / tile.height;
	return {
		width,
		height,
		backgroundImage: `url(${url})`,
		backgroundSize: `${tile.sheetWidth * scaleX}px ${tile.sheetHeight * scaleY}px`,
		backgroundPosition: `-${tile.x * scaleX}px -${tile.y * scaleY}px`
	};
};

// How a thumbnail fills the screen in full mode, the way the video itself is shown.
export const coverSize = (tile, frameWidth, frameHeight, zoomMode) => {
	const fit = Math.min(frameWidth / tile.width, frameHeight / tile.height);
	const crop = Math.max(frameWidth / tile.width, frameHeight / tile.height);
	if (zoomMode === 'stretch') return {width: frameWidth, height: frameHeight};
	const scale = zoomMode === 'autoCrop' ? crop : fit;
	return {width: tile.width * scale, height: tile.height * scale};
};

// Rests this far above the bar, and the strip's tiles sit this far apart. The overflow margin
// lets the strip's last tile start a little past the bar's end.
const REST_GAP = 8;
const TILE_SPACING = 4;
const OVERFLOW_MARGIN = 16;

// The scrub preview, drawn the way the viewer set it up: one thumbnail, a strip of them a scrub
// step apart, or the thumbnail over the whole picture. It stays mounted while the controls are up
// so the sheets the next scrub steps need are already loading when the viewer starts moving (warm),
// and it shows only while scrubbing (visible). The tile at the scrub position keeps its last sheet
// until the next has loaded, since a new crop over the old sheet would show the wrong moment.
const TrickplayPreview = ({
	itemId,
	mediaSourceId,
	positionTicks,
	durationTicks,
	stepSeconds,
	mode = 'single',
	scalePercent = 30,
	verticalPercent = 0,
	followScrub = true,
	zoomMode = 'fit',
	visible = false,
	warm = false,
	preferredWidth = 320
}) => {
	const [info, setInfo] = useState(null);
	const [track, setTrack] = useState(null);
	const [, sheetArrived] = useReducer((count) => count + 1, 0);
	const widthRef = useRef(null);
	const lastShownRef = useRef(null);
	const lastPrefetchRef = useRef(null);
	const rootRef = useRef(null);

	useEffect(() => {
		setInfo(null);
		widthRef.current = null;
		lastShownRef.current = null;
		lastPrefetchRef.current = null;
		if (!itemId || !mediaSourceId) return undefined;
		let cancelled = false;
		loadTrickplayManifest(itemId, mediaSourceId).then((manifest) => {
			if (cancelled || !manifest) return;
			const width = pickWidth(manifest, preferredWidth);
			widthRef.current = width;
			setInfo(manifest[width] || null);
		});
		return () => {
			cancelled = true;
		};
	}, [itemId, mediaSourceId, preferredWidth]);

	const positionMs = positionTicks / 10000;
	const durationMs = durationTicks / 10000;
	const urlFor = (imageIndex) => sheetUrl(itemId, mediaSourceId, widthRef.current, imageIndex, info);

	// Warms the sheets around a position in the direction the viewer is heading.
	const prefetch = (fromMs, forward) => {
		const indexes = planSeekSheetIndexes({info, positionMs: fromMs, durationMs, stepMs: stepSeconds * 1000, forward});
		indexes.forEach((index) => whenSheetLoaded(urlFor(index)));
	};

	// The controls coming up is the cue that a scrub may follow.
	useEffect(() => {
		if (warm && info && !visible) prefetch(positionMs, true);
	}, [warm, info]); // eslint-disable-line react-hooks/exhaustive-deps

	// The sheet under the playhead is kept loaded as playback goes along, since a scrub
	// otherwise waits for its download, which a console on wireless can take seconds over.
	const sheetUnderPlayhead = info && positionMs > 0 ? trickplayTile(info, positionMs)?.imageIndex : null;
	useEffect(() => {
		if (sheetUnderPlayhead == null) return;
		whenSheetLoaded(urlFor(sheetUnderPlayhead));
	}, [info, sheetUnderPlayhead]); // eslint-disable-line react-hooks/exhaustive-deps

	// Waiting a frame collapses a burst of presses into one prefetch.
	useEffect(() => {
		if (!visible || !info) return undefined;
		const previous = lastPrefetchRef.current ?? positionMs;
		if (lastPrefetchRef.current === positionMs) return undefined;
		lastPrefetchRef.current = positionMs;
		const frame = window.requestAnimationFrame(() => prefetch(positionMs, positionMs >= previous));
		return () => window.cancelAnimationFrame(frame);
	}, [visible, info, positionMs]); // eslint-disable-line react-hooks/exhaustive-deps

	// The bar the preview lines up with is the element it is drawn inside.
	useLayoutEffect(() => {
		if (!visible) {
			lastShownRef.current = null;
			lastPrefetchRef.current = null;
			setTrack(null);
			return;
		}
		const bar = rootRef.current?.parentElement;
		if (!bar) return;
		const rect = bar.getBoundingClientRect();
		setTrack({width: rect.width, top: rect.top});
	}, [visible]);

	const mainTile = visible && info ? trickplayTile(info, positionMs) : null;
	if (!mainTile) return null;

	// A sheet that isnt in yet is asked for, and a render follows when it lands.
	const sheetReady = (url) => {
		if (loadedSheets.has(url)) return true;
		whenSheetLoaded(url, sheetArrived);
		return false;
	};

	const mainUrl = urlFor(mainTile.imageIndex);
	if (sheetReady(mainUrl)) lastShownRef.current = {url: mainUrl, tile: mainTile};
	const shownMain = lastShownRef.current;

	if (mode === 'full') {
		if (!shownMain) return <div ref={rootRef} />;
		const frame = coverSize(shownMain.tile, window.innerWidth, window.innerHeight, zoomMode);
		return (
			<div ref={rootRef} className={css.cover}>
				<div className={css.sprite} style={spriteStyle(shownMain.url, shownMain.tile, frame.width, frame.height)} />
			</div>
		);
	}

	if (!track) return <div ref={rootRef} />;

	const plan = planTrickplayPreview({
		trackWidth: track.width,
		scalePercent,
		aspect: mainTile.height / mainTile.width,
		maxHeightBudget: Math.max(track.top - REST_GAP - VERTICAL_TRAVEL_TOP_MARGIN, 32),
		positionMs,
		durationMs,
		followScrub,
		verticalPositionPercent: verticalPercent,
		isStrip: mode === 'strip',
		spacing: TILE_SPACING,
		overflowMargin: OVERFLOW_MARGIN,
		stepMs: Math.max(1, stepSeconds * 1000)
	});

	const tileFor = (slot) => {
		if (slot.slotIndex === 0) return shownMain;
		if (slot.targetMs === null) return null;
		const tile = trickplayTile(info, slot.targetMs);
		if (!tile) return null;
		const url = urlFor(tile.imageIndex);
		return sheetReady(url) ? {url, tile} : null;
	};

	return (
		<div ref={rootRef} className={css.strip} style={{left: plan.leftOffset, bottom: REST_GAP + plan.verticalTravel, gap: TILE_SPACING}}>
			{plan.slots.map((slot) => {
				const shown = tileFor(slot);
				return (
					<div
						key={slot.slotIndex}
						className={`${css.tile} ${slot.slotIndex === 0 ? css.tileActive : ''} ${shown ? '' : css.tileEmpty}`}
						style={{width: plan.tileWidth, height: plan.tileHeight}}
					>
						{shown && <div className={css.sprite} style={spriteStyle(shown.url, shown.tile, plan.tileWidth, plan.tileHeight)} />}
					</div>
				);
			})}
		</div>
	);
};

export default TrickplayPreview;
