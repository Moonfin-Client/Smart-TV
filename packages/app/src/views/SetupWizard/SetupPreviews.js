// The live previews the setup wizard shows for each choice.
//
// Every preview lays a miniature home or detail screen out at a fixed design
// size and scales it into the option card, so the proportions inside are the
// real screen's proportions. The artwork comes from the viewer's own library,
// with drawn stand ins until it arrives.

import {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import $L from '@enact/i18n/$L';

import {useSettings} from '../../context/SettingsContext';
import {useAuth} from '../../context/AuthContext';
import {toCssColor, toRgbTriplet, radiusToCss} from '../../theme/themeSpec';
import {resolveOverlayColor} from '../../theme/overlayColors';
import {genreGlowRgb} from '../Browse/galleryGlow';
import {materialIconPath} from '../Settings/materialIconMap';
import {getPreviewItems, subscribePreviewItems} from './setupPreviewData';
import css from './SetupPreviews.module.less';

// The logical size a preview screen is laid out at before being scaled down.
// Measurements inside a preview are the real screen's measurements at this
// size, so the scaled result keeps the true proportions.
const DESIGN_W = 960;
const DESIGN_H = 540;

// Home rows render below their desktop size on a TV, and the previews keep
// that same factor so the mocked rows sit like the real ones.
const ROW_SCALE = 0.8;
const ROW_LEFT_INSET = 80;

const TEXT_SHADOW = '0px 0px 4px rgba(0, 0, 0, 0.54)';

// A few marks the shared icon map doesnt carry.
const LOCAL_ICON_PATHS = {
	search: 'M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z',
	chevron_left: 'M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z',
	chevron_right: 'M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z',
	more_horiz: 'M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z'
};

const MIcon = ({name, size, color, style}) => {
	const path = LOCAL_ICON_PATHS[name] || materialIconPath(name);
	if (!path) return null;
	return (
		<svg width={size} height={size} viewBox='0 -960 960 960' style={style} aria-hidden='true' focusable='false'>
			<path d={path} fill={color} />
		</svg>
	);
};

const withAlpha = (hex, alpha) => `rgba(${toRgbTriplet(hex)}, ${Math.round(alpha * 1000) / 1000})`;

// The card radius grown outward for the focus ring, corner by corner because
// a theme can round each one differently.
const grownRadius = (radius, extra) => {
	if (!radius) return `${extra}px`;
	return `${radius.topLeft + extra}px ${radius.topRight + extra}px ${radius.bottomRight + extra}px ${radius.bottomLeft + extra}px`;
};

// One palette object per render, read the way the real screens read the theme.
export const usePreviewPalette = () => {
	const {settings, activeTheme} = useSettings();
	return useMemo(() => {
		const colors = activeTheme.colors;
		const overlayHex = resolveOverlayColor(settings.mediaBarOverlayColor) || '#6B7280';
		const overlayOpacity = Math.min(100, Math.max(0, Number(settings.mediaBarOverlayOpacity != null ? settings.mediaBarOverlayOpacity : 50))) / 100;
		const navbarHex = resolveOverlayColor(settings.navbarColor) || '#6B7280';
		const navbarOpacity = Math.min(100, Math.max(0, Number(settings.navbarOpacity != null ? settings.navbarOpacity : 50))) / 100;
		const navCycle = activeTheme.navColorCycle || [];
		return {
			background: toCssColor(colors.background),
			surface: toCssColor(colors.surface),
			onSurface: toCssColor(colors.onSurface),
			accent: toCssColor(colors.accent),
			onAccent: toCssColor(colors.onAccent),
			onSurfaceA: (a) => withAlpha(colors.onSurface, a),
			accentA: (a) => withAlpha(colors.accent, a),
			scrimA: (a) => withAlpha(colors.scrim, a),
			backgroundA: (a) => withAlpha(colors.background, a),
			surfaceA: (a) => withAlpha(colors.surface, a),
			overlayA: (a) => withAlpha(overlayHex, a * overlayOpacity),
			navbarSurface: withAlpha(navbarHex, navbarOpacity),
			navColorForSlot: (slot) => (navCycle.length > 0 ? toCssColor(navCycle[slot % navCycle.length]) : null),
			cardRadius: radiusToCss(activeTheme.borders.cardRadius),
			cardRadiusRing: grownRadius(activeTheme.borders.cardRadius, 3.5),
			chipBorder: `${activeTheme.borders.chipBorder.width}px solid ${toCssColor(activeTheme.borders.chipBorder.color)}`,
			cardBorder: `${activeTheme.borders.cardBorder.width}px solid ${toCssColor(activeTheme.borders.cardBorder.color)}`,
			focusBorderColor: toCssColor(activeTheme.borders.focusBorder.color)
		};
	}, [activeTheme, settings.mediaBarOverlayColor, settings.mediaBarOverlayOpacity, settings.navbarColor, settings.navbarOpacity]);
};

const usePreviewItems = () => {
	const [list, setList] = useState(getPreviewItems);
	useEffect(() => subscribePreviewItems(setList), []);
	return list;
};

const itemAt = (items, index) => items[index % items.length];

const runtimeText = (minutes) => {
	if (!minutes) return '';
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
};

const metaParts = (item) => {
	const parts = [];
	if (item.year) parts.push(String(item.year));
	if (item.officialRating) parts.push(item.officialRating);
	if (item.runtimeMinutes) parts.push(runtimeText(item.runtimeMinutes));
	if (item.genres.length > 0) parts.push(item.genres.slice(0, 3).join(' • '));
	return parts;
};

// Scales a fixed size layout into whatever width the card gives it.
const useFitScale = (designW, designH) => {
	const ref = useRef(null);
	const [scale, setScale] = useState(0);
	const measure = useCallback(() => {
		const node = ref.current;
		if (!node) return;
		const w = node.offsetWidth;
		const h = node.offsetHeight;
		if (!w) return;
		const next = designH && h ? Math.min(w / designW, h / designH) : w / designW;
		setScale((prev) => (Math.abs(prev - next) < 0.001 ? prev : next));
	}, [designW, designH]);
	useEffect(() => {
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	});
	return [ref, scale];
};

const PreviewScreen = ({children}) => {
	const t = usePreviewPalette();
	const [ref, scale] = useFitScale(DESIGN_W, 0);
	return (
		<div ref={ref} className={css.screenOuter}>
			<div className={css.screenInner} style={{transform: `scale(${scale})`, backgroundColor: t.background}}>
				{children}
			</div>
		</div>
	);
};

// Drawn stand in shown until the artwork loads or when a first run lands mid
// scan and the library is still empty. It keeps the card's aspect so nothing
// jumps when the artwork arrives.
const FallbackFrame = ({aspect = 16 / 10, children}) => {
	const boxW = 320;
	const boxH = 320 / aspect;
	const [ref, scale] = useFitScale(boxW, boxH);
	return (
		<div ref={ref} className={css.fallbackOuter}>
			<div className={css.fallbackCenter}>
				<div className={css.fallbackBox} style={{width: boxW, height: boxH, transform: `scale(${scale})`}}>
					{children}
				</div>
			</div>
		</div>
	);
};

const LivePreview = ({render, fallback, fallbackAspect}) => {
	const items = usePreviewItems();
	if (items.length === 0) return <FallbackFrame aspect={fallbackAspect}>{fallback}</FallbackFrame>;
	return <PreviewScreen>{render(items)}</PreviewScreen>;
};

const ABS_FILL = {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0};

const Artwork = ({url, position = 'center center', imgStyle, t}) => {
	if (!url) {
		return <div style={{...ABS_FILL, backgroundColor: t.onSurfaceA(0.1)}} />;
	}
	return (
		<img
			src={url}
			alt=''
			style={{...ABS_FILL, width: '100%', height: '100%', objectFit: 'cover', objectPosition: position, ...imgStyle}}
		/>
	);
};

const ALIGN_STYLES = {
	bottomLeft: {alignItems: 'flex-end', justifyContent: 'flex-start', objectPosition: 'left bottom', textAlign: 'left'},
	topLeft: {alignItems: 'flex-start', justifyContent: 'flex-start', objectPosition: 'left top', textAlign: 'left'}
};

// The item's logo when it has one, its title otherwise, matching how the real
// bar and detail pages fall back.
const LogoOrTitle = ({item, width, height, alignment = 'bottomLeft', fallbackStyle}) => {
	const align = ALIGN_STYLES[alignment] || ALIGN_STYLES.bottomLeft;
	if (item.logoUrl) {
		return (
			<img
				src={item.logoUrl}
				alt=''
				style={{width, height, objectFit: 'contain', objectPosition: align.objectPosition, display: 'block'}}
			/>
		);
	}
	return (
		<div style={{width, height, display: 'flex', alignItems: align.alignItems, justifyContent: align.justifyContent}}>
			<div
				style={{
					...fallbackStyle,
					textAlign: align.textAlign,
					display: '-webkit-box',
					WebkitLineClamp: 2,
					WebkitBoxOrient: 'vertical',
					overflow: 'hidden'
				}}
			>
				{item.title}
			</div>
		</div>
	);
};

const CommunityRating = ({item, t}) => {
	if (item.communityRating == null) return null;
	return (
		<div style={{display: 'flex', alignItems: 'center'}}>
			<MIcon name='star' size={16} color='#FFC107' />
			<div style={{marginLeft: 4, fontSize: 14, fontWeight: 700, color: t.onSurface}}>
				{item.communityRating.toFixed(1)}
			</div>
		</div>
	);
};

const MetadataWrap = ({item, t}) => {
	const style = {fontSize: 12, fontWeight: 600, color: t.onSurfaceA(0.9)};
	const parts = metaParts(item);
	const children = [];
	for (let i = 0; i < parts.length; i++) {
		if (i > 0) children.push(<span key={`sep${i}`} style={style}>{' • '}</span>);
		if (item.officialRating && parts[i] === item.officialRating) {
			children.push(
				<span key={`part${i}`} style={{...style, fontSize: 11, padding: '1px 5px', borderRadius: 3, border: t.chipBorder}}>
					{parts[i]}
				</span>
			);
		} else {
			children.push(<span key={`part${i}`} style={style}>{parts[i]}</span>);
		}
	}
	return (
		<div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center'}}>
			{children}
		</div>
	);
};

const Dots = ({count, active, inactive, inactiveAlpha, gap = 4, pillActive = false, height, t}) => {
	const dots = [];
	for (let i = 0; i < count; i++) {
		const w = i === 0 ? active : inactive;
		const h = height != null ? height : (i === 0 ? (pillActive ? inactive : active) : inactive);
		dots.push(
			<div
				key={i}
				style={{
					width: w,
					height: h,
					marginLeft: gap,
					marginRight: gap,
					borderRadius: pillActive ? 3 : '50%',
					backgroundColor: i === 0 ? t.onSurface : t.onSurfaceA(inactiveAlpha)
				}}
			/>
		);
	}
	return <div style={{display: 'flex', alignItems: 'center'}}>{dots}</div>;
};

const NavArrow = ({name, t}) => (
	<div
		style={{
			width: 48,
			height: 48,
			marginLeft: 8,
			marginRight: 8,
			borderRadius: '50%',
			backgroundColor: t.scrimA(0.4),
			border: t.cardBorder,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center'
		}}
	>
		<MIcon name={name} size={28} color={t.onSurfaceA(0.9)} />
	</div>
);

// Text turned on its side, the way a book spine reads. The wrapper measures
// itself because the rotated line's width is the wrapper's height.
const RotatedLabel = ({text, textStyle}) => {
	const ref = useRef(null);
	const [length, setLength] = useState(0);
	useEffect(() => {
		if (ref.current) setLength(ref.current.offsetHeight);
	}, []);
	return (
		<div ref={ref} style={{flex: '1 1 auto', alignSelf: 'stretch', position: 'relative', minHeight: 0, width: '100%'}}>
			{length > 0 && (
				<div
					style={{
						...textStyle,
						position: 'absolute',
						left: '50%',
						top: '50%',
						width: length,
						transform: 'translate(-50%, -50%) rotate(-90deg)',
						textAlign: 'center',
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis'
					}}
				>
					{text}
				</div>
			)}
		</div>
	);
};

const clampLines = (lines) => ({
	display: '-webkit-box',
	WebkitLineClamp: lines,
	WebkitBoxOrient: 'vertical',
	overflow: 'hidden'
});

// ---------------------------------------------------------------------------
// Home rows
// ---------------------------------------------------------------------------

const RowCard = ({item, height, aspect, imageUrl, progress, t}) => {
	const width = height * aspect;
	return (
		<div style={{width, flexShrink: 0, marginRight: 12}}>
			<div style={{position: 'relative', width, height, borderRadius: t.cardRadius, overflow: 'hidden'}}>
				<Artwork url={imageUrl || item.posterUrl} t={t} />
				{progress != null && (
					<div style={{position: 'absolute', left: 6, right: 6, bottom: 6, height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex'}}>
						<div style={{width: `${Math.round(progress * 100)}%`, backgroundColor: t.accent}} />
						<div style={{flex: '1 1 auto', backgroundColor: t.scrimA(0.54)}} />
					</div>
				)}
			</div>
			<div style={{marginTop: 6, fontSize: 13, fontWeight: 700, color: t.onSurface, textShadow: TEXT_SHADOW, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
				{item.title}
			</div>
			{item.year && (
				<div style={{marginTop: 2, fontSize: 12, color: t.onSurfaceA(0.6), textShadow: TEXT_SHADOW}}>
					{item.year}
				</div>
			)}
		</div>
	);
};

// The focused modern card holds the state the style is about: the thumb
// morphed to 16 by 9, the focus ring, and the text block it grows underneath.
const FocusedRowCard = ({item, posterHeight, t}) => {
	const width = posterHeight * 16 / 9;
	return (
		<div style={{width, flexShrink: 0, marginRight: 12}}>
			<div style={{position: 'relative', width, height: posterHeight}}>
				<div style={{position: 'absolute', top: 0, left: 0, width, height: posterHeight, borderRadius: t.cardRadius, overflow: 'hidden'}}>
					<Artwork url={item.backdropUrl || item.posterUrl} t={t} />
				</div>
				<div
					style={{
						position: 'absolute',
						top: -3.5,
						bottom: -3.5,
						left: -3.5,
						right: -3.5,
						borderRadius: t.cardRadiusRing,
						border: `3px solid ${t.focusBorderColor}`
					}}
				/>
			</div>
			<div style={{marginTop: 6, fontSize: 13, fontWeight: 700, color: t.onSurface, textShadow: TEXT_SHADOW, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
				{item.title}
			</div>
			{item.year && (
				<div style={{marginTop: 2, fontSize: 12, color: t.onSurfaceA(0.6), textShadow: TEXT_SHADOW}}>
					{item.year}
				</div>
			)}
			<div style={{position: 'relative', width, height: 76, marginTop: 4}}>
				<div style={{position: 'absolute', left: 0, top: 0, width: width * 2.4}}>
					<CommunityRating item={item} t={t} />
					{item.overview && (
						<div style={{marginTop: 4, fontSize: 12, lineHeight: 1.4, color: t.onSurfaceA(0.7), textShadow: TEXT_SHADOW, ...clampLines(3)}}>
							{item.overview}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

const HomeRow = ({title, items, t, modern, thumbs = false, offset = 0, withFocus = false, posterHeight, thumbHeight}) => {
	const cards = [];
	for (let i = 0; i < 8; i++) {
		if (withFocus && i === 0) {
			cards.push(<FocusedRowCard key={i} item={itemAt(items, offset)} posterHeight={posterHeight} t={t} />);
		} else {
			cards.push(
				<RowCard
					key={i}
					item={itemAt(items, i + offset)}
					height={thumbs ? thumbHeight : posterHeight}
					aspect={thumbs ? 16 / 9 : 2 / 3}
					imageUrl={thumbs ? itemAt(items, i + offset).backdropUrl : null}
					progress={thumbs && i === 0 ? 0.35 : (thumbs && i === 1 ? 0.7 : null)}
					t={t}
				/>
			);
		}
	}
	return (
		<div>
			<div style={{padding: modern ? '6px 8px 1px 16px' : '16px 8px 8px 16px', fontSize: 16, fontWeight: 600, color: t.onSurface}}>
				{title}
			</div>
			<div style={{padding: '5px 20px 5px 16px', display: 'flex', alignItems: 'flex-start', overflow: 'hidden'}}>
				{cards}
			</div>
		</div>
	);
};

const HomeRowsColumn = ({items, t, modern, focusFirst = false, rowGapOverride}) => {
	const posterHeight = (modern ? 240 : 150) * ROW_SCALE;
	const thumbHeight = 110 * ROW_SCALE;
	const rowGap = rowGapOverride != null ? rowGapOverride : (modern ? 60 : 18);
	const first = items[0];
	return (
		<div style={{paddingLeft: ROW_LEFT_INSET - 16, paddingTop: 16}}>
			{!modern && (
				// Classic keeps the info overlay band above the rows, so its
				// preview starts with one. Modern shows its metadata under the
				// focused card instead.
				<div style={{padding: '24px 16px 12px 16px'}}>
					<div style={{height: 145, overflow: 'hidden'}}>
						<div style={{fontSize: 26, fontWeight: 800, color: t.onSurface, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
							{first.title}
						</div>
						<div style={{marginTop: 6}}>
							<MetadataWrap item={first} t={t} />
						</div>
						{first.overview && (
							<div style={{marginTop: 8, fontSize: 13, lineHeight: 1.4, color: t.onSurfaceA(0.7), ...clampLines(2)}}>
								{first.overview}
							</div>
						)}
					</div>
				</div>
			)}
			<HomeRow title={$L('Continue Watching')} items={items} t={t} modern={modern} thumbs={!modern} withFocus={focusFirst} posterHeight={posterHeight} thumbHeight={thumbHeight} />
			<div style={{height: rowGap}} />
			<HomeRow title={$L('Recently Added')} items={items} t={t} modern={modern} offset={3} posterHeight={posterHeight} thumbHeight={thumbHeight} />
			<div style={{height: rowGap}} />
			<HomeRow title={$L('Next Up')} items={items} t={t} modern={modern} thumbs={!modern} offset={6} posterHeight={posterHeight} thumbHeight={thumbHeight} />
		</div>
	);
};

const HomeRowsScreen = ({items, t, modern, focusFirst = false, rowGapOverride}) => (
	<div style={{width: '100%', height: '100%', overflow: 'hidden'}}>
		<HomeRowsColumn items={items} t={t} modern={modern} focusFirst={focusFirst} rowGapOverride={rowGapOverride} />
	</div>
);

// ---------------------------------------------------------------------------
// Media bar modes
// ---------------------------------------------------------------------------

const MoonfinBar = ({items, t}) => {
	const item = items[0];
	return (
		<div style={{position: 'relative', width: '100%', height: '100%'}}>
			<Artwork url={item.backdropUrl} t={t} />
			<div
				style={{
					...ABS_FILL,
					background: `linear-gradient(to bottom, ${t.overlayA(0.3)} 0%, ${t.overlayA(0.1)} 40%, ${t.overlayA(0.8)} 100%)`
				}}
			/>
			<div style={{position: 'absolute', top: 56, left: 40}}>
				<LogoOrTitle
					item={item}
					width={280}
					height={120}
					fallbackStyle={{fontSize: 28, fontWeight: 800, lineHeight: 1.05, color: t.onSurface, textShadow: TEXT_SHADOW}}
				/>
			</div>
			<div style={{position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 24px 36px 24px'}}>
				<div style={{padding: '12px 16px', backgroundColor: t.overlayA(0.75), borderRadius: 16, border: t.cardBorder}}>
					<MetadataWrap item={item} t={t} />
					{item.overview && (
						<div style={{marginTop: 8, fontSize: 14, lineHeight: 1.4, color: t.onSurfaceA(0.9), ...clampLines(3)}}>
							{item.overview}
						</div>
					)}
				</div>
			</div>
			<div style={{position: 'absolute', left: 0, right: 0, bottom: 8, display: 'flex', justifyContent: 'center'}}>
				<div style={{padding: '6px 12px', backgroundColor: t.overlayA(0.6), borderRadius: 12}}>
					<Dots count={5} active={10} inactive={8} inactiveAlpha={0.5} t={t} />
				</div>
			</div>
			<div style={{position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)'}}>
				<NavArrow name='chevron_left' t={t} />
			</div>
			<div style={{position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)'}}>
				<NavArrow name='chevron_right' t={t} />
			</div>
		</div>
	);
};

const MakdBar = ({items, t}) => {
	const item = items[0];
	const contentWidth = Math.min(560, Math.max(280, DESIGN_W * 0.42));
	return (
		<div style={{position: 'relative', width: '100%', height: '100%'}}>
			<Artwork url={item.backdropUrl} t={t} />
			<div
				style={{
					...ABS_FILL,
					background: `linear-gradient(to right, ${t.overlayA(0.78)} 0%, ${t.overlayA(0.46)} 46%, ${t.overlayA(0.06)} 100%)`
				}}
			/>
			<div
				style={{
					...ABS_FILL,
					background: `linear-gradient(to bottom, ${t.overlayA(0.12)} 0%, ${t.overlayA(0.28)} 48%, ${t.overlayA(0.78)} 100%)`
				}}
			/>
			<div style={{position: 'absolute', left: 50, top: DESIGN_H * 0.22}}>
				<LogoOrTitle
					item={item}
					width={Math.min(640, Math.max(220, DESIGN_W * 0.45))}
					height={Math.min(300, Math.max(90, DESIGN_H * 0.35))}
					fallbackStyle={{fontSize: 30, fontWeight: 800, lineHeight: 1.05, color: t.onSurface, textShadow: TEXT_SHADOW}}
				/>
			</div>
			<div style={{position: 'absolute', left: 50, bottom: 20, width: contentWidth}}>
				<MetadataWrap item={item} t={t} />
				{item.overview && (
					<div style={{marginTop: 10, fontSize: 14, lineHeight: 1.38, color: t.onSurfaceA(0.88), ...clampLines(3)}}>
						{item.overview}
					</div>
				)}
			</div>
			<div style={{position: 'absolute', right: 20, bottom: 24}}>
				<Dots count={5} active={9} inactive={7} inactiveAlpha={0.45} gap={5} t={t} />
			</div>
		</div>
	);
};

const BOOK_INK = 'rgba(229, 213, 184, 0.9)';
const BOOK_INK_SOLID = '#E5D5B8';
const glowColor = (genres) => `rgb(${genreGlowRgb(genres)})`;
const glowColorA = (genres, a) => `rgba(${genreGlowRgb(genres)}, ${a})`;

const BookshelfSpine = ({item, index, spineWidth, spineHeight}) => (
	<div
		style={{
			width: spineWidth,
			height: spineHeight,
			marginLeft: 2,
			marginRight: 2,
			flexShrink: 0,
			borderRadius: 6,
			background: `linear-gradient(to right, rgba(0, 0, 0, 0.35) 0%, rgba(255, 255, 255, 0.12) 25%, ${glowColor(item.genres)} 60%, rgba(0, 0, 0, 0.45) 100%)`,
			boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.55)',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center'
		}}
	>
		<div style={{paddingTop: 8, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: BOOK_INK}}>
			{String(index + 1).length < 2 ? `0${index + 1}` : String(index + 1)}
		</div>
		<div style={{width: 1, height: 16, marginTop: 4, marginBottom: 4, backgroundColor: 'rgba(229, 213, 184, 0.25)'}} />
		<RotatedLabel
			text={item.title.toUpperCase()}
			textStyle={{fontSize: 10.5, letterSpacing: 1.2, fontWeight: 700, color: BOOK_INK_SOLID, textShadow: '0px 0px 2px #000000'}}
		/>
		<div style={{height: 8, flexShrink: 0}} />
	</div>
);

const BookshelfBar = ({items, t}) => {
	const active = items[0];
	const activeHeight = DESIGN_H * 0.84;
	const activeWidth = activeHeight * 0.72;
	const spineHeight = DESIGN_H * 0.76;
	const spineWidth = 36;
	const centerWidth = activeWidth + 56;
	const maxSide = Math.min(20, Math.max(1, Math.floor(((DESIGN_W - centerWidth) / 2) / (spineWidth + 4))));
	const bookRadius = '3px 8px 8px 3px';

	const leftSpines = [];
	for (let i = maxSide; i >= 1; i--) {
		leftSpines.push(<BookshelfSpine key={i} item={itemAt(items, i)} index={i} spineWidth={spineWidth} spineHeight={spineHeight} />);
	}
	const rightSpines = [];
	for (let i = maxSide + 1; i <= maxSide * 2; i++) {
		rightSpines.push(<BookshelfSpine key={i} item={itemAt(items, i)} index={i} spineWidth={spineWidth} spineHeight={spineHeight} />);
	}

	return (
		<div style={{position: 'relative', width: '100%', height: '100%'}}>
			<div style={{...ABS_FILL, display: 'flex'}}>
				<div style={{flex: '1 1 auto', background: 'linear-gradient(to right, #130905, #23150D)'}} />
				<div style={{width: centerWidth, backgroundColor: '#1C100A', borderLeft: '8px solid #382314', borderRight: '8px solid #382314'}} />
				<div style={{flex: '1 1 auto', background: 'linear-gradient(to right, #23150D, #130905)'}} />
			</div>
			<div style={{...ABS_FILL, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 12}}>
				{leftSpines}
				<div style={{width: 8, flexShrink: 0}} />
				<div
					style={{
						width: activeWidth,
						height: activeHeight,
						flexShrink: 0,
						position: 'relative',
						backgroundColor: glowColor(active.genres),
						borderRadius: bookRadius,
						boxShadow: '0px 6px 14px rgba(0, 0, 0, 0.75)',
						overflow: 'hidden'
					}}
				>
					<div style={{position: 'absolute', top: 0, bottom: 0, left: activeWidth * 0.12, right: 0}}>
						<Artwork url={active.posterUrl} t={t} />
					</div>
				</div>
				<div style={{width: 8, flexShrink: 0}} />
				{rightSpines}
			</div>
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					bottom: 0,
					height: 12,
					background: 'linear-gradient(to bottom, #5A3D28, #26180E)',
					borderTop: '1.5px solid rgba(255, 255, 255, 0.08)',
					boxShadow: '0px -2px 5px rgba(0, 0, 0, 0.65)'
				}}
			/>
		</div>
	);
};

const GalleryBadge = ({text, t, tinted = false, outlined = false}) => (
	<span
		style={{
			display: 'inline-block',
			padding: '5px 10px',
			marginRight: 8,
			marginBottom: 8,
			backgroundColor: tinted ? t.accentA(0.22) : t.scrimA(0.35),
			borderRadius: 8,
			border: outlined ? `1px solid ${t.onSurfaceA(0.55)}` : 'none',
			fontSize: 12,
			fontWeight: 600,
			color: t.onSurface
		}}
	>
		{text}
	</span>
);

const ShimmerBar = ({width, t}) => (
	<div style={{width, height: 12, marginTop: 6, backgroundColor: t.onSurfaceA(0.12), borderRadius: 6}} />
);

const GalleryIdlePanel = ({item, index, t}) => (
	<div style={{flex: '1 1 0%', minWidth: 0, paddingLeft: 3, paddingRight: 3, display: 'flex', flexDirection: 'column'}}>
		<div style={{height: 24, fontSize: 14, fontWeight: 800, letterSpacing: 1.5, color: t.onSurfaceA(0.85), textAlign: 'center'}}>
			{String(index + 1).length < 2 ? `0${index + 1}` : String(index + 1)}
		</div>
		<div style={{height: 6, flexShrink: 0}} />
		<div style={{flex: '1 1 auto', position: 'relative', borderRadius: 14, overflow: 'hidden'}}>
			<Artwork url={item.backdropUrl} imgStyle={{opacity: 0.35}} t={t} />
			<div style={{...ABS_FILL, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
				<div style={{width: 2, height: 24, flexShrink: 0, backgroundColor: t.accentA(0.7)}} />
				<RotatedLabel
					text={item.title.toUpperCase()}
					textStyle={{fontSize: 14, fontWeight: 700, letterSpacing: 2, color: t.onSurface, textShadow: `0px 0px 6px ${t.scrimA(0.8)}`}}
				/>
				<div style={{width: 2, height: 24, flexShrink: 0, backgroundColor: t.accentA(0.7)}} />
			</div>
		</div>
	</div>
);

const GalleryBar = ({items, t}) => {
	const active = items[0];
	const idlePanels = [];
	for (let i = 1; i < 5; i++) {
		idlePanels.push(<GalleryIdlePanel key={i} item={itemAt(items, i)} index={i} t={t} />);
	}
	return (
		<div style={{position: 'relative', width: '100%', height: '100%'}}>
			<div
				style={{
					...ABS_FILL,
					background: `radial-gradient(ellipse 110% 110% at 40% 55%, ${glowColorA(active.genres, 0.42)} 0%, ${glowColorA(active.genres, 0.14)} 45%, ${t.backgroundA(0)} 100%)`
				}}
			/>
			<div style={{position: 'absolute', top: DESIGN_H * 0.09, bottom: DESIGN_H * 0.03, left: 24, right: 24, borderRadius: 18, overflow: 'hidden', display: 'flex'}}>
				<div style={{flex: '16 1 0%', minWidth: 0, paddingLeft: 3, paddingRight: 3, display: 'flex', flexDirection: 'column'}}>
					<div style={{height: 30, flexShrink: 0}} />
					<div style={{flex: '1 1 auto', position: 'relative', borderRadius: 14, overflow: 'hidden'}}>
						<Artwork url={active.backdropUrl} t={t} />
						<div
							style={{
								...ABS_FILL,
								background: `linear-gradient(to top right, ${t.scrimA(0.95)}, ${t.scrimA(0.15)})`
							}}
						/>
						<div style={{...ABS_FILL, padding: '24px 24px 24px 28px', display: 'flex', alignItems: 'flex-end'}}>
							<div style={{flex: '3 1 0%', minWidth: 0}}>
								<div
									style={{
										fontSize: 34,
										fontWeight: 900,
										lineHeight: 1.02,
										letterSpacing: 1,
										color: t.onSurface,
										textShadow: `0px 0px 12px ${t.scrimA(0.7)}`,
										...clampLines(2)
									}}
								>
									{active.title.toUpperCase()}
								</div>
								<div style={{marginTop: 12, display: 'flex', flexWrap: 'wrap'}}>
									{active.runtimeMinutes && <GalleryBadge text={runtimeText(active.runtimeMinutes)} t={t} />}
									{active.officialRating && <GalleryBadge text={active.officialRating} outlined t={t} />}
									{active.year && <GalleryBadge text={String(active.year)} t={t} />}
									{active.genres.slice(0, 3).map((genre) => (
										<GalleryBadge key={genre} text={genre} tinted t={t} />
									))}
								</div>
								{active.overview && (
									<div style={{marginTop: 14, fontSize: 16, lineHeight: 1.45, color: t.onSurfaceA(0.9), ...clampLines(3)}}>
										{active.overview}
									</div>
								)}
							</div>
							<div style={{width: 28, flexShrink: 0}} />
							<div style={{flex: '2 1 0%', minWidth: 0, padding: 18, backgroundColor: t.scrimA(0.55), borderRadius: 18, border: `1px solid ${t.onSurfaceA(0.12)}`}}>
								<div style={{fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: t.accent}}>{$L('Director').toUpperCase()}</div>
								<ShimmerBar width={120} t={t} />
								<div style={{marginTop: 14, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: t.accent}}>{$L('STARRING').toUpperCase()}</div>
								<ShimmerBar width={160} t={t} />
								<ShimmerBar width={140} t={t} />
							</div>
						</div>
					</div>
				</div>
				{idlePanels}
			</div>
		</div>
	);
};

const BannerBar = ({items, t}) => {
	const item = items[0];
	const parts = [];
	if (item.year) parts.push(String(item.year));
	if (item.runtimeMinutes) parts.push(runtimeText(item.runtimeMinutes));
	if (item.officialRating) parts.push(item.officialRating);
	return (
		<div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
			<div style={{padding: '0 16px 8px 16px', flexShrink: 0}}>
				<div style={{position: 'relative', height: 320, borderRadius: 14, overflow: 'hidden'}}>
					<Artwork url={item.backdropUrl} t={t} />
					<div style={{...ABS_FILL, background: 'linear-gradient(to right, rgba(0, 0, 0, 0.902), rgba(0, 0, 0, 0))'}} />
					<div style={{position: 'absolute', left: 20, right: 20, bottom: 16}}>
						<LogoOrTitle
							item={item}
							width={240}
							height={56}
							fallbackStyle={{fontSize: 22, fontWeight: 800, color: t.onSurface, textShadow: `0px 0px 10px ${t.scrimA(0.8)}`}}
						/>
						<div style={{marginTop: 6, fontSize: 12, fontWeight: 600, color: t.onSurfaceA(0.75)}}>
							{parts.join('  ·  ')}
						</div>
					</div>
					<div style={{position: 'absolute', top: 12, right: 16}}>
						<Dots count={5} active={16} inactive={6} inactiveAlpha={0.4} gap={2} pillActive t={t} />
					</div>
				</div>
			</div>
			<div style={{flex: '1 1 auto', overflow: 'hidden'}}>
				<HomeRowsColumn items={items} t={t} modern />
			</div>
		</div>
	);
};

// Artwork first, with the logo top left and the page marks top right. The bar
// takes 65 percent of the screen, so the rows always show underneath it.
const AyaBar = ({items, t}) => {
	const item = items[0];
	const barHeight = DESIGN_H * 0.65 - 103;
	return (
		<div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
			<div style={{padding: '71px 80px 32px 80px', flexShrink: 0}}>
				<div style={{position: 'relative', height: barHeight, borderRadius: 18, overflow: 'hidden'}}>
					<Artwork url={item.backdropUrl} t={t} />
					<div style={{position: 'absolute', left: 44, top: 40}}>
						<LogoOrTitle
							item={item}
							width={340}
							height={100}
							alignment='topLeft'
							fallbackStyle={{fontSize: 32, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.0, color: t.onSurface, textShadow: `0px 0px 20px ${t.scrimA(0.72)}`}}
						/>
					</div>
					<div style={{position: 'absolute', top: 22, right: 24}}>
						<Dots count={5} active={16} inactive={10} inactiveAlpha={0.30} gap={2.5} pillActive height={2} t={t} />
					</div>
				</div>
			</div>
			<div style={{flex: '1 1 auto', overflow: 'hidden'}}>
				<HomeRowsColumn items={items} t={t} modern />
			</div>
		</div>
	);
};

// ---------------------------------------------------------------------------
// Navbar positions
// ---------------------------------------------------------------------------

const NAV_ICONS = ['home', 'search', 'shuffle', 'favorite', 'video_library', 'settings'];

const navIconColor = (t, slot) => t.navColorForSlot(slot) || t.onSurfaceA(0.6);

const NavAvatar = ({name}) => {
	const initial = name ? name.charAt(0).toUpperCase() : '?';
	return (
		<div
			style={{
				width: 40,
				height: 40,
				borderRadius: '50%',
				backgroundColor: 'rgba(255, 255, 255, 0.1)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				fontSize: 16,
				fontWeight: 600,
				color: '#FFFFFF'
			}}
		>
			{initial}
		</div>
	);
};

const NavbarRows = ({items, t, topInset = 12}) => (
	<div style={{flex: '1 1 auto', overflow: 'hidden', paddingTop: topInset}}>
		<HomeRowsColumn items={items} t={t} modern rowGapOverride={24} />
	</div>
);

// The toolbar draws no band of its own. An avatar sits on the left, the
// buttons live in one translucent pill in the middle, and the clock keeps the
// right, all floating straight over the content.
const TopNavbarPreview = ({items, t, userName}) => {
	const now = new Date();
	const pad = (value) => (value < 10 ? `0${value}` : String(value));
	const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
	return (
		<div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
			<div style={{height: 95, flexShrink: 0, padding: '27px 48px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
				<div style={{position: 'absolute', left: 48, top: '50%', transform: 'translateY(-50%)'}}>
					<NavAvatar name={userName} />
				</div>
				<div style={{backgroundColor: t.navbarSurface, borderRadius: 36, display: 'flex'}}>
					{NAV_ICONS.map((name, i) => (
						<div key={name} style={{width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
							<MIcon name={name} size={24} color={navIconColor(t, i)} />
						</div>
					))}
				</div>
				<div style={{position: 'absolute', right: 48, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 600, color: t.onSurfaceA(0.8)}}>
					{clock}
				</div>
			</div>
			<NavbarRows items={items} t={t} />
		</div>
	);
};

// The collapsed rail is a bare gutter of icons with no backdrop, so the
// preview keeps it transparent too and just moves the rows over.
const LeftNavbarPreview = ({items, t}) => (
	<div style={{width: '100%', height: '100%', display: 'flex', overflow: 'hidden'}}>
		<div style={{width: 72, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
			{NAV_ICONS.map((name, i) => (
				<div key={name} style={{height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
					<MIcon name={name} size={24} color={navIconColor(t, i)} />
				</div>
			))}
		</div>
		<NavbarRows items={items} t={t} topInset={24} />
	</div>
);

// ---------------------------------------------------------------------------
// Detail screen styles
// ---------------------------------------------------------------------------

const DetailActionTile = ({icon, label, t}) => (
	<div style={{width: 108, display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12}}>
		<div style={{width: 58, height: 58, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
			<MIcon name={icon} size={27} color={t.onSurface} />
		</div>
		<div style={{marginTop: 8, fontSize: 11, fontWeight: 600, color: t.onSurface, textAlign: 'center', ...clampLines(2)}}>
			{label}
		</div>
	</div>
);

const CastPlaceholderRow = ({t, avatarRadius}) => {
	const people = [];
	for (let i = 0; i < 8; i++) {
		people.push(
			<div key={i} style={{marginRight: 16, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
				<div style={{width: avatarRadius * 2, height: avatarRadius * 2, borderRadius: '50%', backgroundColor: t.onSurfaceA(0.12)}} />
				<div style={{marginTop: 6, width: avatarRadius * 1.6, height: 8, borderRadius: 4, backgroundColor: t.onSurfaceA(0.16)}} />
			</div>
		);
	}
	return <div style={{display: 'flex', overflow: 'hidden'}}>{people}</div>;
};

const ClassicDetail = ({items, t}) => {
	const item = items[0];
	const actions = [
		['play_arrow', $L('Play')],
		['shuffle', $L('Shuffle')],
		['subtitles', $L('Subtitles')],
		['check', $L('Watched')],
		['favorite', $L('Favorite')],
		['more_horiz', $L('More')]
	];
	const morePosters = [];
	for (let i = 1; i < 8; i++) {
		morePosters.push(
			<div key={i} style={{marginRight: 12, flexShrink: 0, width: 150}}>
				<div style={{position: 'relative', width: 150, height: 225, borderRadius: 8, overflow: 'hidden'}}>
					<Artwork url={itemAt(items, i).posterUrl} t={t} />
				</div>
				<div style={{marginTop: 6, fontSize: 13, fontWeight: 700, color: '#FFFFFF', textShadow: TEXT_SHADOW, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
					{itemAt(items, i).title}
				</div>
			</div>
		);
	}
	return (
		<div style={{position: 'relative', width: '100%', height: '100%'}}>
			{item.backdropUrl && (
				<Artwork url={item.backdropUrl} imgStyle={{filter: 'blur(10px)', WebkitFilter: 'blur(10px)'}} t={t} />
			)}
			<div
				style={{
					...ABS_FILL,
					background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.4) 30%, rgba(0, 0, 0, 0.8) 100%)'
				}}
			/>
			<div style={{...ABS_FILL, overflow: 'hidden'}}>
				<div style={{padding: '60px 48px 16px 48px', display: 'flex', alignItems: 'flex-end'}}>
					<div style={{flex: '1 1 auto', minWidth: 0}}>
						<LogoOrTitle
							item={item}
							width={350}
							height={80}
							fallbackStyle={{fontSize: 32, fontWeight: 700, color: '#FFFFFF', textShadow: TEXT_SHADOW}}
						/>
						<div style={{marginTop: 12}}>
							<MetadataWrap item={item} t={t} />
						</div>
						<div style={{marginTop: 8}}>
							<CommunityRating item={item} t={t} />
						</div>
						{item.overview && (
							<div style={{marginTop: 8, fontSize: 14, lineHeight: 1.4, color: 'rgba(255, 255, 255, 0.8)', textShadow: TEXT_SHADOW, ...clampLines(4)}}>
								{item.overview}
							</div>
						)}
					</div>
					<div style={{width: 32, flexShrink: 0}} />
					<div style={{width: 165, height: 248, flexShrink: 0, position: 'relative', borderRadius: 8, overflow: 'hidden'}}>
						<Artwork url={item.posterUrl} t={t} />
					</div>
				</div>
				<div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center'}}>
					{actions.map(([icon, label]) => (
						<div key={icon} style={{marginLeft: 4, marginRight: 4}}>
							<DetailActionTile icon={icon} label={label} t={t} />
						</div>
					))}
				</div>
				<div style={{height: 32}} />
				<div style={{padding: '0 48px'}}>
					<div style={{fontSize: 20, fontWeight: 700, color: '#FFFFFF', textShadow: TEXT_SHADOW}}>{$L('Cast')}</div>
					<div style={{marginTop: 12}}>
						<CastPlaceholderRow t={t} avatarRadius={45} />
					</div>
					<div style={{marginTop: 32, fontSize: 20, fontWeight: 700, color: '#FFFFFF', textShadow: TEXT_SHADOW}}>{$L('More Like This')}</div>
					<div style={{marginTop: 12, display: 'flex', overflow: 'hidden'}}>{morePosters}</div>
				</div>
			</div>
		</div>
	);
};

const PillTab = ({label, t, selected = false}) => (
	<div
		style={{
			height: 38,
			padding: '0 15px',
			display: 'flex',
			alignItems: 'center',
			borderRadius: 999,
			backgroundColor: selected ? t.accent : 'transparent',
			fontSize: 13,
			fontWeight: selected ? 600 : 500,
			color: selected ? t.onAccent : t.onSurfaceA(0.75),
			whiteSpace: 'nowrap'
		}}
	>
		{label}
	</div>
);

const CircleButton = ({icon, t}) => (
	<div
		style={{
			width: 52,
			height: 52,
			marginLeft: 8,
			borderRadius: '50%',
			backgroundColor: 'rgba(255, 255, 255, 0.06)',
			border: `1.5px solid ${t.onSurfaceA(0.35)}`,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center'
		}}
	>
		<MIcon name={icon} size={24} color={t.onSurface} />
	</div>
);

const ModernDetail = ({items, t}) => {
	const item = items[0];
	const gradientScale = 0.58;
	const metaStyle = {fontSize: 14, color: t.onSurfaceA(0.75)};
	const metaChildren = [];
	if (item.year) metaChildren.push(<span key='year' style={metaStyle}>{item.year}</span>);
	if (item.officialRating) metaChildren.push(<span key='rating' style={metaStyle}>{item.officialRating}</span>);
	if (item.runtimeMinutes) {
		metaChildren.push(
			<span key='runtime' style={{...metaStyle, display: 'inline-flex', alignItems: 'center'}}>
				<MIcon name='schedule' size={14} color={t.onSurfaceA(0.75)} style={{marginRight: 4}} />
				{runtimeText(item.runtimeMinutes)}
			</span>
		);
	}
	if (item.genres.length > 0) metaChildren.push(<span key='genres' style={metaStyle}>{item.genres.slice(0, 3).join(' · ')}</span>);
	const meta = [];
	for (let i = 0; i < metaChildren.length; i++) {
		if (i > 0) meta.push(<span key={`dot${i}`} style={{...metaStyle, margin: '0 8px'}}>{'·'}</span>);
		meta.push(metaChildren[i]);
	}
	return (
		<div style={{position: 'relative', width: '100%', height: '100%'}}>
			<Artwork url={item.backdropUrl} position='right center' t={t} />
			<div style={{...ABS_FILL, backgroundColor: 'rgba(0, 0, 0, 0.32)'}} />
			<div
				style={{
					...ABS_FILL,
					background: `linear-gradient(to right, ${t.backgroundA(1.0 * gradientScale)} 0%, ${t.backgroundA(0.90 * gradientScale)} 35%, ${t.backgroundA(0.45 * gradientScale)} 60%, ${t.backgroundA(0)} 85%)`
				}}
			/>
			<div
				style={{
					...ABS_FILL,
					background: `linear-gradient(to top, ${t.backgroundA(1.0 * gradientScale)} 0%, ${t.backgroundA(0.80 * gradientScale)} 45%, ${t.backgroundA(0)} 80%)`
				}}
			/>
			<div style={{...ABS_FILL, overflow: 'hidden', padding: '71px 40px 0 40px'}}>
				<div style={{width: Math.min(1100, Math.max(450, DESIGN_W * 0.85))}}>
					<LogoOrTitle
						item={item}
						width={300}
						height={75}
						fallbackStyle={{fontSize: 34, fontWeight: 700, color: t.onSurface}}
					/>
					<div style={{marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center'}}>{meta}</div>
					<div style={{marginTop: 6}}>
						<CommunityRating item={item} t={t} />
					</div>
					{item.overview && (
						<div style={{marginTop: 8, maxWidth: 800, fontSize: 14, lineHeight: 1.45, color: t.onSurfaceA(0.85), ...clampLines(4)}}>
							{item.overview}
						</div>
					)}
					<div style={{marginTop: 24, display: 'flex', alignItems: 'center'}}>
						<div
							style={{
								height: 54,
								minWidth: 200,
								padding: '0 14px 0 10px',
								backgroundColor: t.accent,
								borderRadius: 27,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center'
							}}
						>
							<MIcon name='play_arrow' size={24} color={t.onAccent} />
							<div style={{marginLeft: 4, fontSize: 13, fontWeight: 700, color: t.onAccent}}>{$L('Play')}</div>
						</div>
						<CircleButton icon='favorite' t={t} />
						<CircleButton icon='check' t={t} />
						<CircleButton icon='more_horiz' t={t} />
					</div>
					<div style={{marginTop: 16, display: 'flex'}}>
						<div style={{padding: 3, backgroundColor: t.onSurfaceA(0.08), borderRadius: 999, display: 'flex'}}>
							<PillTab label={$L('Cast')} selected t={t} />
							<PillTab label={$L('Studios')} t={t} />
							<PillTab label={$L('Chapters')} t={t} />
							<PillTab label={$L('Details')} t={t} />
							<PillTab label={$L('More Like This')} t={t} />
						</div>
					</div>
					<div style={{marginTop: 8}}>
						<CastPlaceholderRow t={t} avatarRadius={45} />
					</div>
				</div>
			</div>
		</div>
	);
};

// ---------------------------------------------------------------------------
// Drawn stand ins
// ---------------------------------------------------------------------------

const FallBar = ({width, height, color, style}) => (
	<div style={{width, height, borderRadius: height / 2, backgroundColor: color, ...style}} />
);

const FallPoster = ({width, t, style}) => (
	<div style={{width, height: width * 1.5, borderRadius: 3, backgroundColor: t.onSurfaceA(0.16), flexShrink: 0, ...style}} />
);

const fallBackdrop = (t) => ({background: `linear-gradient(to bottom right, ${t.accentA(0.34)}, ${t.surface})`});

const FallbackMediaBar = ({mode, t}) => {
	const strong = t.onSurfaceA(0.78);
	const weak = t.onSurfaceA(0.3);
	if (mode === 'moonfin') {
		return (
			<div style={{width: '100%', height: '100%', ...fallBackdrop(t), display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 8}}>
				<FallBar width={46} height={4} color={strong} />
				<FallBar width={28} height={4} color={weak} style={{marginTop: 3}} />
			</div>
		);
	}
	if (mode === 'makd') {
		return (
			<div style={{width: '100%', height: '100%', ...fallBackdrop(t), display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
				<div style={{width: '56%', height: '62%', padding: 6, backgroundColor: t.onSurfaceA(0.1), borderRadius: 6, border: `1px solid ${t.onSurfaceA(0.16)}`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'}}>
					<FallBar width={34} height={4} color={strong} />
					<FallBar width={20} height={4} color={weak} style={{marginTop: 3}} />
				</div>
			</div>
		);
	}
	if (mode === 'bookshelf') {
		return (
			<div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
				{[0, 1, 2, 3, 4].map((i) => (
					<FallPoster key={i} width={18} t={t} style={{marginLeft: 3, marginRight: 3}} />
				))}
			</div>
		);
	}
	if (mode === 'gallery') {
		return (
			<div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
				<FallPoster width={14} t={t} style={{opacity: 0.5, marginLeft: 3, marginRight: 3}} />
				<FallPoster width={14} t={t} style={{opacity: 0.5, marginLeft: 3, marginRight: 3}} />
				<FallPoster width={22} t={t} style={{marginLeft: 3, marginRight: 3}} />
				<FallPoster width={14} t={t} style={{opacity: 0.5, marginLeft: 3, marginRight: 3}} />
				<FallPoster width={14} t={t} style={{opacity: 0.5, marginLeft: 3, marginRight: 3}} />
			</div>
		);
	}
	if (mode === 'aya') {
		return (
			<div style={{width: '100%', height: '100%', padding: 6}}>
				<div style={{position: 'relative', width: '100%', height: '100%', borderRadius: 6, overflow: 'hidden', ...fallBackdrop(t)}}>
					<div style={{position: 'absolute', top: 8, left: 8}}>
						<FallBar width={42} height={5} color={strong} />
					</div>
					<div style={{position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center'}}>
						<FallBar width={8} height={2} color={strong} style={{marginLeft: 2}} />
						<FallBar width={5} height={2} color={weak} style={{marginLeft: 2}} />
						<FallBar width={5} height={2} color={weak} style={{marginLeft: 2}} />
					</div>
				</div>
			</div>
		);
	}
	if (mode === 'banner') {
		return (
			<div style={{width: '100%', height: '100%', ...fallBackdrop(t), display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
				<div style={{width: '88%', height: '44%', padding: '0 8px', backgroundColor: t.onSurfaceA(0.12), borderRadius: 5, display: 'flex', alignItems: 'center'}}>
					<FallBar width={38} height={4} color={strong} />
				</div>
			</div>
		);
	}
	return (
		<div style={{width: '100%', height: '100%', padding: '0 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
			<FallBar width={30} height={3} color={weak} />
			<div style={{display: 'flex', marginTop: 6}}>
				{[0, 1, 2, 3].map((i) => (
					<FallPoster key={i} width={13} t={t} style={{marginRight: 4}} />
				))}
			</div>
			<FallBar width={30} height={3} color={weak} style={{marginTop: 6}} />
		</div>
	);
};

const FallbackHomeRows = ({modern, t}) => {
	const weak = t.onSurfaceA(0.3);
	const rows = [0, 1].map((row) => (
		<div key={row} style={{marginBottom: 9}}>
			<FallBar width={44} height={3} color={weak} style={{marginBottom: 9}} />
			<div style={{display: 'flex'}}>
				{(modern ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5]).map((i) => (
					modern ? (
						<div key={i} style={{marginRight: 7}}>
							<FallPoster width={26} t={t} />
							<FallBar width={18} height={3} color={weak} style={{marginTop: 3}} />
						</div>
					) : (
						<FallPoster key={i} width={18} t={t} style={{marginRight: 5}} />
					)
				))}
			</div>
		</div>
	));
	return (
		<div style={{width: '100%', height: '100%', padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
			{rows}
		</div>
	);
};

const FallbackNavbar = ({position, t}) => {
	const strong = t.onSurfaceA(0.78);
	const weak = t.onSurfaceA(0.3);
	const marks = [0, 1, 2, 3].map((i) => (
		<FallBar key={i} width={8} height={3} color={strong} style={{margin: position === 'left' ? '2.5px 0' : '0 2.5px'}} />
	));
	const chrome = (
		<div
			style={{
				width: position === 'left' ? 16 : '100%',
				height: position === 'left' ? '100%' : 16,
				flexShrink: 0,
				backgroundColor: t.onSurfaceA(0.14),
				display: 'flex',
				flexDirection: position === 'left' ? 'column' : 'row',
				alignItems: 'center',
				justifyContent: 'center'
			}}
		>
			{marks}
		</div>
	);
	const rows = (
		<div style={{flex: '1 1 auto', padding: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
			<FallBar width={30} height={3} color={weak} />
			<div style={{display: 'flex', marginTop: 6}}>
				{[0, 1, 2, 3].map((i) => (
					<FallPoster key={i} width={13} t={t} style={{marginRight: 4}} />
				))}
			</div>
		</div>
	);
	if (position === 'left') {
		return <div style={{width: '100%', height: '100%', display: 'flex'}}>{chrome}{rows}</div>;
	}
	return <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column'}}>{chrome}{rows}</div>;
};


// Spotlight keeps Modern's hero and swaps the tab row for a band of summary cards, each
// naming a section and opening it.
const SpotlightCardTile = ({label, count, t}) => (
	<div
		style={{
			width: 190,
			height: 108,
			marginRight: 16,
			borderRadius: 14,
			border: `1px solid ${t.onSurfaceA(0.12)}`,
			backgroundColor: t.onSurfaceA(0.06),
			position: 'relative',
			overflow: 'hidden'
		}}
	>
		<div style={{...ABS_FILL, background: `linear-gradient(to bottom, ${t.backgroundA(0.05)} 35%, ${t.backgroundA(0.45)} 65%, ${t.backgroundA(0.85)} 100%)`}} />
		<div style={{position: 'absolute', left: 10, top: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: t.backgroundA(0.45)}} />
		<div style={{position: 'absolute', left: 12, right: 12, bottom: 10}}>
			<div style={{fontSize: 14, fontWeight: 700, color: t.onSurface}}>{label}</div>
			<div style={{fontSize: 11, color: t.onSurfaceA(0.75)}}>{count}</div>
		</div>
	</div>
);

const SpotlightDetail = ({items, t}) => {
	const item = items[0];
	const gradientScale = 0.58;
	const metaStyle = {fontSize: 14, color: t.onSurfaceA(0.75)};
	const meta = [];
	if (item.year) meta.push(<span key='year' style={metaStyle}>{item.year}</span>);
	if (item.officialRating) meta.push(<span key='rating' style={{...metaStyle, marginLeft: 16}}>{item.officialRating}</span>);
	if (item.genres.length > 0) meta.push(<span key='genres' style={{...metaStyle, marginLeft: 16}}>{item.genres.slice(0, 3).join(' · ')}</span>);
	return (
		<div style={{position: 'relative', width: '100%', height: '100%'}}>
			<Artwork url={item.backdropUrl} position='right center' t={t} />
			<div style={{...ABS_FILL, backgroundColor: 'rgba(0, 0, 0, 0.32)'}} />
			<div style={{...ABS_FILL, background: `linear-gradient(to right, ${t.backgroundA(1.0 * gradientScale)} 0%, ${t.backgroundA(0.90 * gradientScale)} 35%, ${t.backgroundA(0.45 * gradientScale)} 60%, ${t.backgroundA(0)} 85%)`}} />
			<div style={{...ABS_FILL, background: `linear-gradient(to top, ${t.backgroundA(1.0 * gradientScale)} 0%, ${t.backgroundA(0.80 * gradientScale)} 45%, ${t.backgroundA(0)} 80%)`}} />
			<div style={{...ABS_FILL, overflow: 'hidden', padding: '71px 40px 0 40px', display: 'flex', flexDirection: 'column'}}>
				<div style={{width: Math.min(1100, Math.max(450, DESIGN_W * 0.85))}}>
					<LogoOrTitle item={item} width={300} height={75} fallbackStyle={{fontSize: 34, fontWeight: 700, color: t.onSurface}} />
					<div style={{marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center'}}>{meta}</div>
					<div style={{marginTop: 6}}>
						<CommunityRating item={item} t={t} />
					</div>
					{item.overview && (
						<div style={{marginTop: 8, maxWidth: 800, fontSize: 14, lineHeight: 1.45, color: t.onSurfaceA(0.85), ...clampLines(3)}}>
							{item.overview}
						</div>
					)}
					<div style={{marginTop: 20, display: 'flex', alignItems: 'center'}}>
						<div style={{height: 54, minWidth: 200, padding: '0 14px 0 10px', backgroundColor: t.accent, borderRadius: 27, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
							<MIcon name='play_arrow' size={24} color={t.onAccent} />
							<div style={{marginLeft: 4, fontSize: 13, fontWeight: 700, color: t.onAccent}}>{$L('Play')}</div>
						</div>
						<CircleButton icon='favorite' t={t} />
						<CircleButton icon='check' t={t} />
						<CircleButton icon='more_horiz' t={t} />
					</div>
					<div style={{marginTop: 28, display: 'flex'}}>
						<SpotlightCardTile label={$L('Cast, Crew, and Studios')} count={$L('{count} people').replace('{count}', 24)} t={t} />
						<SpotlightCardTile label={$L('Chapters and Extras')} count={$L('{count} chapters').replace('{count}', 18)} t={t} />
						<SpotlightCardTile label={$L('Recommendations')} count={$L('{count} titles').replace('{count}', 12)} t={t} />
					</div>
				</div>
			</div>
		</div>
	);
};

const FallbackDetail = ({modern, t}) => {
	const strong = t.onSurfaceA(0.78);
	const weak = t.onSurfaceA(0.3);
	if (!modern) {
		return (
			<div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
				<FallPoster width={30} t={t} />
				<FallBar width={50} height={4} color={strong} style={{marginTop: 5}} />
				<FallBar width={32} height={3} color={weak} style={{marginTop: 5}} />
				<div style={{width: 34, height: 10, marginTop: 5, borderRadius: 5, backgroundColor: t.onSurfaceA(0.85)}} />
			</div>
		);
	}
	return (
		<div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column'}}>
			<div style={{flex: '4 1 0%', ...fallBackdrop(t)}} />
			<div style={{flex: '6 1 0%', padding: '0 10px 8px 10px', display: 'flex', flexDirection: 'column'}}>
				<div style={{transform: 'translateY(-12px)'}}>
					<FallBar width={46} height={4} color={strong} />
					<FallBar width={30} height={3} color={weak} style={{marginTop: 4}} />
				</div>
				<div style={{flex: '1 1 auto'}} />
				<div style={{display: 'flex'}}>
					<FallBar width={16} height={3} color={strong} style={{marginRight: 8}} />
					<FallBar width={16} height={3} color={weak} style={{marginRight: 8}} />
					<FallBar width={16} height={3} color={weak} />
				</div>
			</div>
		</div>
	);
};

// ---------------------------------------------------------------------------
// The pickable previews
// ---------------------------------------------------------------------------

export const MediaBarPreview = ({mode}) => {
	const t = usePreviewPalette();
	const render = useCallback((items) => {
		if (mode === 'makd') return <MakdBar items={items} t={t} />;
		if (mode === 'bookshelf') return <BookshelfBar items={items} t={t} />;
		if (mode === 'gallery') return <GalleryBar items={items} t={t} />;
		if (mode === 'banner') return <BannerBar items={items} t={t} />;
		if (mode === 'aya') return <AyaBar items={items} t={t} />;
		// The rows carry the whole screen with the bar off, so the preview
		// packs them tighter than the style default to show more than one.
		if (mode === 'off') return <HomeRowsScreen items={items} t={t} modern rowGapOverride={24} />;
		return <MoonfinBar items={items} t={t} />;
	}, [mode, t]);
	return <LivePreview render={render} fallback={<FallbackMediaBar mode={mode} t={t} />} fallbackAspect={16 / 7} />;
};

export const NavbarPreview = ({position}) => {
	const t = usePreviewPalette();
	const {user} = useAuth();
	const render = useCallback((items) => (
		position === 'left'
			? <LeftNavbarPreview items={items} t={t} />
			: <TopNavbarPreview items={items} t={t} userName={user?.Name} />
	), [position, t, user?.Name]);
	return <LivePreview render={render} fallback={<FallbackNavbar position={position} t={t} />} />;
};

export const HomeRowsPreview = ({modern}) => {
	const t = usePreviewPalette();
	// Modern's whole point is the focused card, so its preview holds the first
	// card in that state with the text block it grows underneath.
	const render = useCallback((items) => <HomeRowsScreen items={items} t={t} modern={modern} focusFirst={modern} />, [modern, t]);
	return <LivePreview render={render} fallback={<FallbackHomeRows modern={modern} t={t} />} />;
};

export const DetailStylePreview = ({variant}) => {
	const t = usePreviewPalette();
	const render = useCallback((items) => {
		if (variant === 'v1') return <ClassicDetail items={items} t={t} />;
		if (variant === 'v3') return <SpotlightDetail items={items} t={t} />;
		return <ModernDetail items={items} t={t} />;
	}, [variant, t]);
	return <LivePreview render={render} fallback={<FallbackDetail modern={variant !== 'v1'} t={t} />} />;
};

export {MIcon as SetupIcon};
