import {memo, useMemo} from 'react';

import {useSettings} from '../../context/SettingsContext';
import {getServerUrl} from '../../services/jellyfinApi';
import {POSTER_LABEL_CORNERS, posterBadgesPerCorner, posterLabelsBase, usePosterBadges} from '../../services/posterBadgesApi';
import {rem} from '../../utils/rootScale';
import {normalizeServerUrl} from '../../utils/serverUrl';
import {CORE_ICON_PATHS} from '../../views/Settings/settingsCoreIcons';
import {posterLabelCorners} from './posterLabelLook';

import css from './PosterLabels.module.less';

// Only the server's own movies and episodes. A Seerr or outside list title carries an id the
// server could mistake for one of its own, and in unified mode an item from another server would
// be asked about on the wrong one. `serverUrl` is where the screen got the item, for screens that
// don't tag each one.
const posterLabelItemId = (item, serverUrl) => {
	if (!item?.Id || (item.Type !== 'Movie' && item.Type !== 'Episode') || item.LocationType === 'Virtual') return null;
	if ((item._seerr || item._external) && !item._resolvedFromExternal) return null;
	const from = item._serverUrl || serverUrl;
	if (from && normalizeServerUrl(from) !== getServerUrl()) return null;
	return item.Id;
};

const flagUrl = (code) => `${posterLabelsBase()}/Moonfin/Assets/flag-${code}.svg`;

const Label = ({look}) => {
	if (look.flagOnly) {
		return (
			<span className={css.flagOnly} style={look.style}>
				<img src={flagUrl(look.flag)} alt={look.name} />
			</span>
		);
	}
	return (
		<span className={css.pill} style={look.style} role={look.name ? 'img' : undefined} aria-label={look.name || undefined}>
			{look.icon && (
				<svg className={css.icon} style={look.iconStyle} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d={CORE_ICON_PATHS[look.icon]} />
				</svg>
			)}
			{look.flag && <img className={css.flag} src={flagUrl(look.flag)} alt="" style={look.flagStyle} />}
			{look.text && <span className={css.text}>{look.text}</span>}
		</span>
	);
};

// The admin's labels over one poster. The offsets say where each corner's stack starts, clear of
// the card's own badges, and `height` bounds the frame to the art when text sits under it in the
// same box.
const PosterLabels = ({item, serverUrl, scale = 0.85, inset = 8, top = 8, topRight = 8, bottom = 8, bottomLeft = bottom, height}) => {
	const {settings} = useSettings();
	const on = settings.showPosterLabels !== false && Boolean(settings.useMoonfinPlugin);
	const itemId = useMemo(() => (on ? posterLabelItemId(item, serverUrl) : null), [on, item, serverUrl]);
	const badges = usePosterBadges(itemId);
	const perCorner = posterBadgesPerCorner();
	const corners = useMemo(() => posterLabelCorners(badges, perCorner, scale), [badges, perCorner, scale]);
	if (!corners) return null;

	const side = rem(inset);
	const places = {
		topLeft: {top: rem(top), left: side},
		topRight: {top: rem(topRight), right: side},
		bottomLeft: {bottom: rem(bottomLeft), left: side},
		bottomRight: {bottom: rem(bottom), right: side}
	};
	return (
		<div className={css.frame} style={height ? {height, bottom: 'auto'} : undefined}>
			{POSTER_LABEL_CORNERS.map((corner) => corners[corner] && (
				<div key={corner} className={`${css.corner} ${css[corner]}`} style={places[corner]}>
					{corners[corner].map((look, i) => <Label key={i} look={look} />)}
				</div>
			))}
		</div>
	);
};

export default memo(PosterLabels);
