import {memo, useCallback, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Marquee from '@enact/sandstone/Marquee';
import Spinner from '@enact/sandstone/Spinner';

import {fittingItems} from '../../utils/measureText';
import {rem} from '../../utils/rootScale';
import useSurfaceAccent from '../../hooks/useSurfaceAccent';
import {toRgbTriplet} from '../../theme/themeSpec';
import {GUIDE_ICONS, GuideIcon} from './GuideIcons';

import css from './LiveTV.module.less';

const SpottableDiv = Spottable('div');

// The accent color a program without a genre borrows, until one is picked for Live TV.
const DEFAULT_ACCENT = '#00a4dc';

// Every horizontal padding a cell's text sits inside: the cell gap, the text inset, and the
// right hand inset.
const CELL_TEXT_INSET = 1.5 + 17 + 12;
// Below this a cell drops its metadata line and keeps its title on one line.
const MIN_META_WIDTH = 139;
// A continuation cell this narrow gives up its inset so the arrow still fits.
const NARROW_MARKER_WIDTH = 70;
const META_FONT_SIZE = 20;
const META_SEPARATOR = ' · ';

// One slice of a row's timeline: a program, a gap in the schedule, a hole a filter made, or the
// placeholder a row shows while its programs load. The row owns focus and navigation, the cell
// only draws what it's handed.
export const ProgramCell = memo(({
	cell, left, width, spotlightId, genre, rating, tags, isLive, isPast, progress, hasTimer,
	startsBeforeWindow, noProgramLabel, onFocusCell, onKeyDownCell, onSelectCell
}) => {
	const [focused, setFocused] = useState(false);

	const handleFocus = useCallback(() => {
		setFocused(true);
		onFocusCell(cell);
	}, [cell, onFocusCell]);
	const handleBlur = useCallback(() => setFocused(false), []);
	const handleKeyDown = useCallback((e) => onKeyDownCell(e, cell), [cell, onKeyDownCell]);
	const handleClick = useCallback(() => onSelectCell(cell), [cell, onSelectCell]);

	const accent = useSurfaceAccent('liveTv', DEFAULT_ACCENT);
	const tint = genre || {color: accent, rgb: toRgbTriplet(accent)};
	const program = cell.program;
	const isGap = cell.kind === 'gap';
	const loading = cell.kind === 'loading';
	const background = focused ? '#1c2c3c' : isLive ? `rgba(${tint.rgb}, 0.14)` : 'rgba(26, 26, 26, 0.5)';

	const innerWidth = width - CELL_TEXT_INSET;
	const showMarker = startsBeforeWindow && !isGap;
	const metaItems = !isGap && innerWidth >= MIN_META_WIDTH
		? fittingItems([rating, ...tags].filter((item) => item && item.trim()).map((item) => item.trim()), innerWidth, META_FONT_SIZE, META_SEPARATOR)
		: [];
	const showMeta = metaItems.length > 0;
	// The row has room for a second title line only when there's no metadata line under it.
	const wrapTitle = !isGap && !loading && innerWidth >= MIN_META_WIDTH && !showMeta;
	const narrowMarker = showMarker && width < NARROW_MARKER_WIDTH;

	let body;
	if (loading) {
		body = <div className={css.cellCentered}><Spinner size="small" className={css.cellSpinner} /></div>;
	} else if (isGap) {
		body = <div className={css.cellCentered}><span className={css.gapLabel}>{noProgramLabel}</span></div>;
	} else {
		const title = program?.Name || '';
		const titleNode = focused && !wrapTitle
			? <Marquee className={css.cellTitle} marqueeOn="render" marqueeSpeed={29} marqueeDelay={1500}>{title}</Marquee>
			: <div className={`${css.cellTitle} ${wrapTitle ? css.cellTitleWrap : ''}`}>{title}</div>;
		body = (
			<div className={`${css.cellText} ${narrowMarker ? css.cellTextNarrow : ''}`}>
				<div className={css.cellTitleRow}>
					{showMarker && <GuideIcon className={css.continuesIcon} path={GUIDE_ICONS.continuesFrom} />}
					<div className={css.cellTitleBox}>{titleNode}</div>
					{hasTimer && <GuideIcon className={css.timerDot} path={GUIDE_ICONS.record} />}
				</div>
				{showMeta && <div className={css.cellMeta}>{metaItems.join(META_SEPARATOR)}</div>}
			</div>
		);
	}

	return (
		<SpottableDiv
			className={css.cellSlot}
			style={{left: rem(left), width: rem(width)}}
			spotlightId={spotlightId}
			onFocus={handleFocus}
			onBlur={handleBlur}
			onKeyDown={handleKeyDown}
			onClick={handleClick}
		>
			<div
				className={`${css.programCell} ${focused ? css.programCellFocused : ''} ${isPast ? css.programCellPast : ''}`}
				style={{backgroundColor: background}}
			>
				{!loading && (
					<div
						className={css.genreBar}
						style={{backgroundColor: program ? tint.color : 'rgba(255, 255, 255, 0.18)', opacity: focused || isLive ? 0.9 : 0.5}}
					/>
				)}
				{body}
				{isLive && progress > 0 && (
					<div className={css.cellProgressTrack}>
						<div className={css.cellProgressFill} style={{width: `${Math.min(100, progress * 100)}%`}} />
					</div>
				)}
			</div>
		</SpottableDiv>
	);
});

// Logo on the left, the number chip and the name right aligned against the trailing edge.
export const ChannelCell = memo(({channel, index, logoUrl, spotlightId, onFocusChannel, onKeyDownChannel, onSelectChannel}) => {
	const [focused, setFocused] = useState(false);
	const [logoFailed, setLogoFailed] = useState(false);

	const handleFocus = useCallback(() => {
		setFocused(true);
		onFocusChannel(channel, index);
	}, [channel, index, onFocusChannel]);
	const handleBlur = useCallback(() => setFocused(false), []);
	const handleKeyDown = useCallback((e) => onKeyDownChannel(e, index), [index, onKeyDownChannel]);
	const handleClick = useCallback(() => onSelectChannel(channel), [channel, onSelectChannel]);
	const handleLogoError = useCallback(() => setLogoFailed(true), []);

	const isFavorite = channel.UserData?.IsFavorite === true;
	const number = channel.ChannelNumber;

	return (
		<SpottableDiv
			className={css.channelSlot}
			spotlightId={spotlightId}
			onFocus={handleFocus}
			onBlur={handleBlur}
			onKeyDown={handleKeyDown}
			onClick={handleClick}
		>
			<div className={`${css.channelCell} ${focused ? css.channelCellFocused : ''}`}>
				<div className={css.channelLogo}>
					{logoUrl && !logoFailed ? (
						<img src={logoUrl} alt="" onError={handleLogoError} />
					) : (
						<GuideIcon className={css.channelLogoFallback} path={GUIDE_ICONS.tv} />
					)}
				</div>
				<div className={css.channelText}>
					{(number || isFavorite) && (
						<div className={css.channelTopRow}>
							{isFavorite && <GuideIcon className={css.channelFavorite} path={GUIDE_ICONS.favorite} />}
							{number && <span className={`${css.channelNumberChip} ${focused ? css.channelNumberChipFocused : ''}`}>{number}</span>}
						</div>
					)}
					{focused ? (
						<Marquee className={css.channelName} alignment="right" marqueeOn="render" marqueeSpeed={29} marqueeDelay={1500}>{channel.Name || ''}</Marquee>
					) : (
						<div className={css.channelName}>{channel.Name || ''}</div>
					)}
				</div>
			</div>
		</SpottableDiv>
	);
});
