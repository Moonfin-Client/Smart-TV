import {useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';

import {useSettings} from '../../context/SettingsContext';
import useUserAvatar from '../../hooks/useUserAvatar';

import css from './NavBar.module.less';

const SpottableButton = Spottable('button');

const NavUserButton = ({onClick}) => {
	const {settings} = useSettings();
	const {user, avatarUrl, initial, onError} = useUserAvatar();

	const avatarStyle = useMemo(
		() => ({opacity: (settings.userOpacity ?? 85) / 100}),
		[settings.userOpacity]
	);

	return (
		<SpottableButton className={`${css.navBtn} ${css.navBtnIcon} ${css.userBtn}`} onClick={onClick}>
			{avatarUrl ? (
				<img
					className={css.userAvatarImg}
					src={avatarUrl}
					alt={user?.Name}
					style={avatarStyle}
					onError={onError}
				/>
			) : (
				<div className={css.userAvatar} style={avatarStyle}>{initial}</div>
			)}
		</SpottableButton>
	);
};

export default NavUserButton;
