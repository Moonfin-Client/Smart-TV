import {useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {MUSIC_FOCUS_IDS, CHIPS} from './musicFocus';

import css from './MusicChips.module.less';

const SpottableDiv = Spottable('div');
const ChipsContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');

// Each chip opens the matching grid.
const MUSIC_CHIPS = [
	{id: 'albums', label: $L('Albums'), icon: 'M480-269q88 0 149.5-61.5T691-480q0-88-61.5-149.5T480-691q-88 0-149.5 61.5T269-480q0 88 61.5 149.5T480-269Zm0-131q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z'},
	{id: 'artists', label: $L('Artists'), icon: 'M0-240v-63q0-43 44-70t116-27q13 0 25 .5t23 2.5q-14 21-21 44t-7 48v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-26-6.5-49T754-397q11-2 22.5-2.5t23.5-.5q72 0 116 27t44 70v63H780ZM160-440q-33 0-56.5-23.5T80-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T160-440Zm640 0q-33 0-56.5-23.5T720-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T800-440Zm-320-40q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q51 0 85.5 34.5T570-600q0 50-34.5 85T480-480Z'},
	{id: 'playlists', label: $L('Playlists'), icon: 'M120-320v-80h280v80H120Zm0-160v-80h440v80H120Zm0-160v-80h440v80H120Zm520 480v-320h240v80H720v240h-80Z'},
	{id: 'genres', label: $L('Genres'), icon: 'M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47Z'},
	{id: 'favorites', label: $L('Favorites'), icon: 'M480-121q-14 0-28-5t-25-15l-58-53q-107-98-183.5-183T85-541.5Q40-611 20-670.5T0-788q0-91 61-152t152-61q54 0 100 24.5t77 66.5q31-42 77-66.5T567-1q91 0 152 61t61 152q0 58-20 117.5T660-377.5Q615-308 538.5-223T355-40l-58 53q-11 10-25 15t-28 5Z'}
];

const MusicChipIcon = ({d}) => (
	<svg viewBox="0 -960 960 960" fill="currentColor" width="24" height="24"><path d={d} /></svg>
);

const MusicChips = ({onSelect, onKeyDown, registerNode}) => {
	const handleRef = useCallback((el) => registerNode(CHIPS, el), [registerNode]);

	const handleClick = useCallback((e) => {
		const id = e.currentTarget?.dataset?.chipId;
		if (id) onSelect(id);
	}, [onSelect]);

	return (
		<ChipsContainer
			className={css.chips}
			ref={handleRef}
			spotlightId={MUSIC_FOCUS_IDS[CHIPS]}
			onKeyDown={onKeyDown}
		>
			{MUSIC_CHIPS.map((chip) => (
				<SpottableDiv
					key={chip.id}
					className={css.chip}
					data-chip-id={chip.id}
					spotlightId={`music-chip-${chip.id}`}
					onClick={handleClick}
				>
					<MusicChipIcon d={chip.icon} />
					<span className={css.chipLabel}>{chip.label}</span>
				</SpottableDiv>
			))}
		</ChipsContainer>
	);
};

export default MusicChips;
