import {useCallback, useLayoutEffect, useRef, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {MaterialIcon} from '../icons/materialIcons';
import {MAX_REACH, clampIndex, initialOf, initialsColor, reachFor, slotOf, unitsWide} from '../../utils/profileCarousel';

import css from './ProfileCarousel.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const SLOT_CLASSES = {0: css.slot0};
for (let i = 1; i <= MAX_REACH + 1; i++) {
	SLOT_CLASSES[-i] = css[`slotM${i}`];
	SLOT_CLASSES[i] = css[`slotP${i}`];
}

const Avatar = ({item}) => {
	const [failed, setFailed] = useState(false);
	const handleError = useCallback(() => setFailed(true), []);
	const initial = initialOf(item.name);

	if (item.imageUrl && !failed) {
		return <img src={item.imageUrl} alt="" className={css.image} onError={handleError} />;
	}
	if (!initial) {
		return (
			<div className={css.initials}>
				<MaterialIcon name="person" className={css.personIcon} />
			</div>
		);
	}
	return <div className={css.initials} style={{backgroundColor: initialsColor(item.id)}}>{initial}</div>;
};

// Each item is {key, id, name, imageUrl, badge: 'active' | 'pin', lines: [{text, accent, lock}], removable}.
// The whole strip is one focus stop: Left and Right move along it and OK opens the one in the middle.
const ProfileCarousel = ({items, initialIndex = 0, spotlightId, onActivate, onRemove}) => {
	const [index, setIndex] = useState(initialIndex);
	const [reach, setReach] = useState(2);
	const stageRef = useRef(null);
	const selected = clampIndex(index, items.length);
	const current = items[selected];

	const handleLeft = useCallback((e) => {
		e.preventDefault();
		e.stopPropagation();
		setIndex(clampIndex(selected - 1, items.length));
	}, [selected, items.length]);

	const handleRight = useCallback((e) => {
		e.preventDefault();
		e.stopPropagation();
		setIndex(clampIndex(selected + 1, items.length));
	}, [selected, items.length]);

	// OK arrives here from the strip itself, a pointer click from the face under it,
	// and a face beside the middle one only moves the strip.
	const handleClick = useCallback((e) => {
		let node = e.target;
		while (node && node !== e.currentTarget && node.dataset?.index === undefined) node = node.parentNode;
		const picked = node && node !== e.currentTarget ? Number(node.dataset.index) : selected;
		if (picked === selected) onActivate?.(items[selected], selected);
		else setIndex(picked);
	}, [items, selected, onActivate]);

	const handleRemove = useCallback((e) => {
		e.stopPropagation();
		onRemove?.(current);
	}, [onRemove, current]);

	// As many faces either side as the width fits
	const hasItems = Boolean(current);
	useLayoutEffect(() => {
		const measure = () => {
			const stage = stageRef.current;
			if (stage) setReach(reachFor(unitsWide(stage.clientWidth, stage.firstChild?.offsetWidth)));
		};
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, [hasItems]);

	if (!current) return null;

	return (
		<SpottableDiv
			className={css.carousel}
			data-spotlight-id={spotlightId}
			data-selected="true"
			onClick={handleClick}
			onSpotlightLeft={handleLeft}
			onSpotlightRight={handleRight}
		>
			<div className={css.stage} ref={stageRef}>
				{items.map((item, i) => {
					const slot = slotOf(i, selected, reach);
					const hidden = Math.abs(slot) > reach;
					return (
						<div key={item.key} data-index={i} className={`${css.item} ${SLOT_CLASSES[slot]} ${hidden ? css.hidden : ''}`}>
							<div className={css.avatar}>
								<Avatar item={item} />
							</div>
							{item.badge && (
								<div className={`${css.badge} ${item.badge === 'active' ? css.badgeActive : css.badgePin}`}>
									<MaterialIcon name={item.badge === 'active' ? 'checkRounded' : 'lockOutline'} className={css.badgeIcon} />
								</div>
							)}
							{slot === 0 && item.removable && onRemove && (
								// Only a pointer reaches this, the remote stays on the strip
								<button className={css.removeBtn} onClick={handleRemove} tabIndex={-1}>
									<MaterialIcon name="close" className={css.removeIcon} />
								</button>
							)}
						</div>
					);
				})}
			</div>
			<div className={css.name}>{current.name}</div>
			{(current.lines || []).map((line) => (
				<div key={line.text} className={`${css.line} ${line.accent ? css.lineAccent : ''}`}>
					{line.lock && <MaterialIcon name="lockOutline" className={css.lineIcon} />}
					{line.text}
				</div>
			))}
			{items.length > 1 && (
				<div className={css.dots}>
					{items.map((item, i) => (
						<span key={item.key} className={i === selected ? css.dotOn : css.dot} />
					))}
				</div>
			)}
		</SpottableDiv>
	);
};

export const PillButton = ({icon, danger, children, ...rest}) => (
	<SpottableButton {...rest} className={`${css.pill} ${danger ? css.pillDanger : ''}`}>
		{icon && <MaterialIcon name={icon} className={css.pillIcon} />}
		{children}
	</SpottableButton>
);

export const PillRow = ({children}) => <div className={css.pillRow}>{children}</div>;

export default ProfileCarousel;
