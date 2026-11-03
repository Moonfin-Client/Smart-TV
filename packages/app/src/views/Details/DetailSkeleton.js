import {SkeletonBox, SkeletonShimmer} from '../../components/Skeleton';
import {frostStageStyle} from './frost/frostRules';

import css from './DetailSkeleton.module.less';

// Sizes follow each style's stylesheet, written in the same pixels and turned into rem so they
// grow and shrink with the rest of the page. The few the styles set inline stay in pixels.
const rem = (px) => px / 24 + 'rem';

const Box = ({width, height, radius = 8, style}) => (
	<SkeletonBox
		width={typeof width === 'number' ? rem(width) : width}
		height={rem(height)}
		radius={rem(radius)}
		style={style}
	/>
);

const Gap = ({size}) => <div style={{height: rem(size)}} />;

const spaced = (index, gap) => (index ? {marginLeft: rem(gap)} : undefined);

const Boxes = ({widths, height, gap, radius}) => (
	<div className={css.row}>
		{widths.map((width, i) => <Box key={i} width={width} height={height} radius={radius} style={spaced(i, gap)} />)}
	</div>
);

const Actions = ({playWidth, circles}) => (
	<div className={css.row}>
		<Box width={playWidth} height={78} radius={39} />
		{Array.from({length: circles}, (_, i) => <Box key={i} width={74} height={74} radius={37} style={{marginLeft: rem(12)}} />)}
	</div>
);

// Poster on the right of a bottom aligned header, the buttons as labelled tiles centered under
// it, then the cast.
const Classic = ({sidebar}) => (
	<>
		<div className={css.classicBackdrop} />
		<div className={css.content} style={{padding: `${rem(116)} ${rem(70)} 0 ${rem(sidebar ? 174 : 70)}`}}>
			<div className={css.classicHeader}>
				<div className={css.classicInfo}>
					<Box width="32vw" height={46} />
					<Gap size={14} />
					<Boxes widths={[78, 104, 65]} height={17} gap={14} radius={4} />
					<Gap size={18} />
					<Box width="100%" height={20} radius={4} />
					<Gap size={8} />
					<Box width="100%" height={20} radius={4} />
					<Gap size={8} />
					<Box width="20vw" height={20} radius={4} />
				</div>
				<Box width={239} height={360} radius={12} style={{marginLeft: rem(46)}} />
			</div>
			<div className={css.classicActions}>
				{Array.from({length: 5}, (_, i) => (
					<div key={i} className={css.classicTile}>
						<Box width={88} height={88} radius={22} />
						<Gap size={12} />
						<Box width={94} height={16} radius={4} />
					</div>
				))}
			</div>
			<Box width={160} height={32} radius={6} />
			<Gap size={36} />
			<div className={css.row}>
				{Array.from({length: 6}, (_, i) => (
					<div key={i} className={css.classicCast} style={spaced(i, 23)}>
						<Box width={135} height={135} radius={68} />
						<Gap size={17} />
						<Box width={90} height={17} radius={4} />
					</div>
				))}
			</div>
		</div>
	</>
);

// Logo and title over the metadata, a rating, the buttons and the tab bar.
const Modern = ({sidebar}) => (
	<>
		<div className={css.modernBackdrop} />
		<div className={css.content} style={{padding: `${rem(135)} ${rem(58)} 0 ${rem(sidebar ? 174 : 58)}`}}>
			<Box width={408} height={109} />
			<Gap size={9} />
			<Box width="35vw" height={52} />
			<Gap size={9} />
			<Boxes widths={[90, 115, 77, 96]} height={20} gap={24} radius={4} />
			<Gap size={9} />
			<Box width={104} height={64} radius={6} />
			<Gap size={35} />
			<Actions playWidth={203} circles={4} />
			<Gap size={23} />
			<Boxes widths={[153, 119, 119, 145, 128]} height={55} gap={24} radius={28} />
		</div>
	</>
);

// The hero at the top with every button round, and the summary cards pinned to the bottom.
const Spotlight = ({sidebar}) => {
	const heroWidth = Math.min(1100, Math.max(450, window.innerWidth * 0.85)) + 'px';
	const cardHeight = Math.min(200, Math.max(120, window.innerHeight * 0.28)) + 'px';
	return (
		<>
			<div className={css.spotlightBackdrop} />
			<div className={css.spotlightPage} style={sidebar ? {paddingLeft: rem(120)} : {paddingTop: rem(135)}}>
				<div style={{width: heroWidth}}>
					<Box width={360} height={18} radius={3} />
					<Gap size={10} />
					<Box width={420} height={72} />
					<Gap size={10} />
					<Boxes widths={[60, 36, 81, 210]} height={21} gap={16} radius={4} />
					<Gap size={10} />
					<Boxes widths={[72, 66, 66, 87, 66]} height={64} gap={9} radius={6} />
					<Gap size={10} />
					<Actions playWidth={78} circles={4} />
				</div>
				<div className={css.row} style={{width: heroWidth}}>
					{Array.from({length: 3}, (_, i) => (
						<div key={i} className={css.spotlightCard} style={{height: cardHeight}}>
							<Box width={36} height={36} radius={18} />
							<div className={css.spotlightCardFoot}>
								<div>
									<Box width={170} height={20} radius={4} />
									<Gap size={6} />
									<Box width={100} height={16} radius={3} />
								</div>
								<Box width={22} height={22} radius={4} />
							</div>
						</div>
					))}
				</div>
			</div>
		</>
	);
};

// Genres over the branding, the metadata and the buttons, then the first rail of wide cards.
const Nouveau = ({sidebar}) => (
	<>
		<div className={css.nouveauBackdrop} />
		<div className={css.content} style={{padding: `${rem(56)} ${rem(56)} 0 ${rem(sidebar ? 176 : 56)}`}}>
			<Box width={300} height={15} radius={3} />
			<Gap size={17} />
			<Box width={480} height={106} />
			<Gap size={14} />
			<Boxes widths={[63, 36, 84, 72, 63]} height={16} gap={13} radius={4} />
			<Gap size={36} />
			<Actions playWidth={179} circles={4} />
			<Gap size={64} />
			<Box width={135} height={30} radius={4} />
			<Gap size={40} />
			<div className={css.row}>
				{Array.from({length: 5}, (_, i) => (
					<div key={i} className={css.card} style={i ? {marginLeft: '40px'} : undefined}>
						<SkeletonBox width={397} height={223} radius={16} />
						<Gap size={10} />
						<Box width={231} height={17} radius={4} />
					</div>
				))}
			</div>
		</div>
	</>
);

// Everything sits on the bottom edge: the logo, the buttons and a rail of episode stills.
const Minimalist = ({sidebar}) => (
	<div className={css.minimalistContent} style={sidebar ? {paddingLeft: rem(176)} : undefined}>
		<Box width={300} height={96} />
		<Gap size={26} />
		<Actions playWidth={178} circles={3} />
		<Gap size={34} />
		<div className={css.row}>
			{Array.from({length: 4}, (_, i) => (
				<SkeletonBox key={i} width={266} height={150} radius={14} style={i ? {marginLeft: '20px'} : undefined} />
			))}
		</div>
	</div>
);

// The poster with play and the circles under it on the left, and the title block beside it.
const Stage = ({sidebar}) => (
	<div className={css.content} style={{padding: `${rem(172)} ${rem(80)} 0 ${rem(sidebar ? 200 : 80)}`}}>
		<div className={css.row} style={{alignItems: 'flex-start'}}>
			<div>
				<Box width={388} height={582} radius={13} />
				<Gap size={28} />
				<Box width={388} height={86} radius={43} />
				<Gap size={24} />
				<Boxes widths={[86, 86, 86, 86]} height={86} gap={14.66} radius={43} />
			</div>
			<div style={{marginLeft: rem(67), flex: '1 1 auto'}}>
				<Box width={480} height={110} />
				<Gap size={16} />
				<Boxes widths={[63, 36, 84, 72, 63]} height={20} gap={13} radius={4} />
				<Gap size={14} />
				<Box width={104} height={48} radius={6} />
				<Gap size={18} />
				<Box width="70%" height={20} radius={4} />
				<Gap size={10} />
				<Box width="70%" height={20} radius={4} />
				<Gap size={10} />
				<Box width="40%" height={20} radius={4} />
			</div>
		</div>
	</div>
);

// The title block centered low on the first screen, with Play and the circles under it.
const Premiere = ({sidebar}) => (
	<div
		className={css.content}
		style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: `0 ${rem(154)} ${rem(90)} ${rem(sidebar ? 200 : 154)}`}}
	>
		<Box width={701} height={93.5} />
		<Gap size={23.4} />
		<Box width={501} height={26.7} radius={4} />
		<Gap size={23.4} />
		<Box width={1035} height={23.4} radius={4} />
		<Gap size={13.4} />
		<Box width={701} height={23.4} radius={4} />
		<Gap size={33.4} />
		<Boxes widths={[250, 83.5, 83.5, 83.5, 83.5]} height={83.5} gap={20} radius={41.75} />
	</div>
);

// Quick Look's drawer: its backdrop over the title block, the buttons and the first lines of the
// overview. The drawer is the box it fills.
const QuickLook = () => (
	<div className={css.content}>
		<SkeletonBox width="100%" height={`calc(32vh - ${rem(56.8)})`} radius="0" />
		<div style={{padding: `${rem(26.7)} ${rem(43.4)} 0`}}>
			<Box width={401} height={46.8} />
			<Gap size={16.7} />
			<Box width={334} height={23.4} />
			<Gap size={33.4} />
			<Boxes widths={[217, 76.8, 76.8, 76.8, 76.8]} height={76.8} gap={16.7} radius={38.4} />
			<Gap size={16.7} />
			{[0, 1, 2].map((i) => (
				<div key={i}>
					<Gap size={13.4} />
					<Box width={i === 2 ? 334 : '100%'} height={20} />
				</div>
			))}
		</div>
	</div>
);

// Frost's window, toolbar and tab bar, on the same stage the page lays out on.
const Frost = ({sidebar}) => (
	<div className={css.content}>
		<div className={css.frostStage} style={frostStageStyle(!sidebar)}>
			<SkeletonBox className={css.frostWindow} radius={rem(66)} />
			<SkeletonBox className={css.frostToolbar} radius={rem(57)} />
			<SkeletonBox className={css.frostTabs} radius={rem(45)} />
		</div>
	</div>
);

const LAYOUTS = {v1: Classic, v2: Modern, v3: Spotlight, v4: Nouveau, v5: Minimalist, v6: Stage, v7: Premiere, v8: QuickLook, v9: Frost};

// Placeholders laid out like the chosen details style while the item loads, so the page fills
// in where they stood.
const DetailSkeleton = ({detailStyle, sidebar}) => {
	const Layout = LAYOUTS[detailStyle] || Modern;
	return (
		<SkeletonShimmer className={css.skeleton}>
			<Layout sidebar={sidebar} />
		</SkeletonShimmer>
	);
};

export default DetailSkeleton;
