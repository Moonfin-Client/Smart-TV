import {useCallback, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import {MaterialIcon} from '../icons/materialIcons';
import {clampIndex, initialOf, initialsColor, slotOf} from '../../utils/profileCarousel';

import css from './ProfileCarousel.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const SLOT_CLASSES = {
	'-3': css.slotM3,
	'-2': css.slotM2,
	'-1': css.slotM1,
	0: css.slot0,
	1: css.slotP1,
	2: css.slotP2,
	3: css.slotP3
};

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
			<div className={css.stage}>
				{items.map((item, i) => {
					const slot = slotOf(i, selected);
					return (
						<div key={item.key} data-index={i} className={`${css.item} ${SLOT_CLASSES[slot]}`}>
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
