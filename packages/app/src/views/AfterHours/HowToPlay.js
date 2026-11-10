import {useEffect, useMemo, useRef} from 'react';
import $L from '@enact/i18n/$L';
import {CAST, drawIcon} from './games';

import css from './AfterHours.module.less';

// A controls line stays under about 90 characters, so a translation still fits.
export const remoteLines = () => ({
	'buffer-run': $L('OK jumps, again mid-air to flip sides. Down slides. On the ceiling Up and Down swap.'),
	'fast-forward': $L('Up and Down change lanes. OK jumps.'),
	'cable-crawl': $L('Arrows turn. The cable never stops.'),
	'case-stack': $L('OK drops the case.'),
	'pixel-purge': $L('Left and Right slide the scrubber.')
});

// Each entry's name and line, by the sprite that draws it. A line stays under about 60 characters,
// since it shows in a narrow column and wraps to three lines at most.
const castText = () => ({
	lagBat: [$L('Lag Bat'), $L('Swoops in at head height. Slide under it.')],
	gremlin: [$L('Static Gremlin'), $L('Hops along the floor or the ceiling toward you. Jump it.')],
	cable: [$L('Cable Coil'), $L('Low on the floor or the ceiling. Jump it.')],
	banner: [$L('Buffering Banner'), $L('Slide under the sign. Its pole is a wall on the other side.')],
	directPlay: [$L('Direct Play'), $L('A shield that takes one hit.')],
	skipIntro: [$L('Skip Intro'), $L('Three seconds of dash that smashes anything.')],
	popcorn: [$L('Popcorn'), $L('25 points a piece.')],
	rollingReel: [$L('Loose Reel'), $L('Rolls down your lane faster than you run. Jump it.')],
	usher: [$L('Usher'), $L('Walks toward you and changes lanes once.')],
	velvetRope: [$L('Velvet Rope'), $L('Low. Jump it or change lanes.')],
	popcornCart: [$L('Popcorn Cart'), $L('Too tall to jump. Change lanes.')],
	frontRowPass: [$L('Front Row Pass'), $L('A shield that takes one hit.')],
	magnet: [$L('Magnet'), $L('Pulls in tickets from every lane for eight seconds.')],
	ticket: [$L('Ticket'), $L('25 points a piece.')],
	bug: [$L('Interference Bug'), $L('Wanders at random.')],
	tangle: [$L('Tangle'), $L('Slowly chases your plug.')],
	staticBlock: [$L('Static'), $L('A dead cell. One appears every third signal.')],
	brick: [$L('Power Brick'), $L('A 2 by 2 block every fifth signal.')],
	ghost: [$L('Ghost'), $L('Five seconds of passing through everything but the edge.')],
	snip: [$L('Snip'), $L('Cuts the cable in half for bonus points.')],
	signal: [$L('Signal'), $L('Points, and two more segments.')],
	shelfCat: [$L('Shelf Cat'), $L('Bats a case as it comes in, so that one slides faster.')],
	bluCase: [$L('Blu-ray Case'), $L('A title from your library. The overhang gets trimmed off.')],
	steelbook: [$L('Steelbook'), $L('Every tenth case. Slides much faster.')],
	perfect: [$L('Perfect Drop'), $L('Land it dead on and the stack grows a little wider.')],
	boxSet: [$L('Box Set'), $L('Three perfect drops in a row grow it a lot wider.')],
	deadPixel: [$L('Dead Pixel'), $L('Falls from cleared blocks. Catching it shrinks the scrubber.')],
	macroblock: [$L('Macroblock'), $L('One hit clears it.')],
	keyframe: [$L('Keyframe'), $L('Takes three hits and drops a powerup.')],
	hdr: [$L('HDR'), $L('A scrubber twice as wide for eight seconds.')],
	bufferNet: [$L('Buffer'), $L('A net under the scrubber that saves one miss.')]
});

const Icon = ({sprite, s, dy, dx}) => {
	const ref = useRef(null);
	useEffect(() => {
		const c = ref.current && ref.current.getContext('2d');
		if (c) drawIcon(c, sprite, s, dy, dx);
	}, [sprite, s, dy, dx]);
	return <canvas ref={ref} width={88} height={88} className={css.icon} />;
};

const HowToPlay = ({id, name, children}) => {
	const text = useMemo(castText, []);
	const remote = useMemo(remoteLines, []);
	const groups = [['enemy', $L('Enemies'), css.enemy], ['obstacle', $L('Obstacles'), css.obstacle], ['power', $L('Powerups'), css.power]];
	return (
		<div className={css.howTo}>
			<span className={css.heading}>{$L('How to play')}</span>
			<h3>{name}</h3>
			<div className={css.controls}><b>{$L('Remote')}</b><span>{remote[id]}</span></div>
			<div className={css.groups}>
				{groups.map(([key, label, tone]) => (
					<div key={key} className={css.group}>
						<h4 className={tone}>{label}</h4>
						{CAST[id][key].map(([sprite, s, dy, dx]) => (
							<div key={sprite} className={css.item}>
								<Icon sprite={sprite} s={s} dy={dy} dx={dx} />
								<div>
									<b>{text[sprite][0]}</b>
									<span>{text[sprite][1]}</span>
								</div>
							</div>
						))}
					</div>
				))}
			</div>
			<div className={css.buttons}>{children}</div>
		</div>
	);
};

export default HowToPlay;
