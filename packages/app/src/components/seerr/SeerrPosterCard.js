import Spottable from '@enact/spotlight/Spottable';

import {useSettings} from '../../context/SettingsContext';
import seerrApi from '../../services/seerrApi';
import {registerThemeSheet} from '../../theme/themeOverrides';
import SeerrMediaTypeBadge from './SeerrMediaTypeBadge';
import SeerrStatusBanner, {hasSeerrDot, seerrBadgeStyle} from './SeerrStatusBanner';
import SeerrStatusDot from './SeerrStatusDot';

import css from './SeerrPosterCard.module.less';

registerThemeSheet('seerrPosterCard', css);

const SpottableDiv = Spottable('div');

// A Seerr title's poster in Core's look, with its title and a line under it, the way the Classic
// Discover rows and the Browse grid draw it. The width comes in on the style.
const SeerrPosterCard = ({item, mediaType, imageHeight, subtitle, placeholder, className, ...rest}) => {
	const {settings} = useSettings();
	const badgeStyle = seerrBadgeStyle(settings);
	const posterUrl = seerrApi.getImageUrl(item.poster_path || item.posterPath, 'w342');
	const title = item.title || item.name;
	const status = item.mediaInfo?.status;
	const banner = badgeStyle === 'banner' && hasSeerrDot(status);
	const itemMediaType = item.media_type || item.mediaType || mediaType;
	const cardClass = [css.card, settings.cardFocusZoom !== false && css.zoom, className].filter(Boolean).join(' ');

	return (
		<SpottableDiv {...rest} className={cardClass}>
			<div className={css.art} style={{height: `${imageHeight}px`}}>
				<div className={`${css.clip}${banner ? ' ' + css.underSeerrBanner : ''}`}>
					{posterUrl ? (
						<img className={css.poster} src={posterUrl} alt={title} loading="lazy" />
					) : placeholder}
					{banner && <SeerrStatusBanner status={status} className={css.banner} />}
					{itemMediaType && <SeerrMediaTypeBadge mediaType={itemMediaType} className={css.typeBadge} />}
					{badgeStyle === 'badge' && <SeerrStatusDot status={status} />}
				</div>
				<div className={css.ring} />
			</div>
			<div className={css.title}>{title}</div>
			{subtitle && <div className={css.subtitle}>{subtitle}</div>}
		</SpottableDiv>
	);
};

export default SeerrPosterCard;
