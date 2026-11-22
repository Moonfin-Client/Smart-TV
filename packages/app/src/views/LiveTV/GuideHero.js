import {memo, useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

import VerticalMarquee from '../../components/VerticalMarquee';
import {RecordingMark} from './GuideIcons';

import css from './LiveTV.module.less';

const SYNOPSIS_LINE_HEIGHT = 23.2 * 1.2;

// The band above the grid that previews whatever is focused. The plate on the left shows the
// program's own artwork when there is some and the channel logo otherwise, and keeps its width
// either way so the artwork arriving is a swap rather than a resize.
const GuideHero = ({title, programTitle, programSubtitle, channelLogoUrl, programImageUrl, timeLabel, genreLabel, officialRating, communityRating, badgeLabel, synopsis, isLive, mark}) => {
	const [failedUrl, setFailedUrl] = useState(null);
	const plateUrl = programImageUrl || channelLogoUrl;
	const usingArtwork = Boolean(programImageUrl);

	useEffect(() => setFailedUrl(null), [plateUrl]);

	// Highest priority first, so whatever the line can't fit is the least important thing on it.
	const meta = [
		isLive ? $L('Live') : null,
		timeLabel,
		genreLabel ? $L(genreLabel) : null,
		officialRating || null,
		communityRating != null ? Number(communityRating).toFixed(1) : null
	].filter(Boolean).join('  ·  ');

	const hasChannelPreview = Boolean(channelLogoUrl) || programTitle != null;
	const showPlate = Boolean(plateUrl);

	return (
		<div className={css.hero}>
			{showPlate && (
				<div className={`${css.heroPlate} ${usingArtwork ? css.heroPlateArtwork : ''}`}>
					{/* Artwork fills the plate as a background, since older engines have no
					    object-fit. The logo keeps its whole wordmark inside the plate. */}
					{usingArtwork ? (
						<div className={css.heroArtwork} style={{backgroundImage: `url("${plateUrl}")`}} />
					) : failedUrl !== plateUrl && (
						<img
							key={plateUrl}
							className={css.heroLogo}
							src={plateUrl}
							alt=""
							onError={() => setFailedUrl(plateUrl)} // eslint-disable-line react/jsx-no-bind
						/>
					)}
				</div>
			)}
			<div className={`${css.heroText} ${showPlate ? css.heroTextWithPlate : ''}`}>
				{hasChannelPreview ? (
					<>
						<div className={css.heroChannelLine}>
							<span className={css.heroChannelTitle}>{title || ''}</span>
							{badgeLabel && <span className={css.heroBadge}>{badgeLabel.toUpperCase()}</span>}
							{meta && <span className={css.heroMeta}>{meta}</span>}
							{mark && <RecordingMark mark={mark} className={css.heroMark} />}
						</div>
						{programTitle ? (
							<div className={css.heroProgramTitle}>
								{programTitle}
								{programSubtitle ? <span className={css.heroProgramSubtitle}>{programSubtitle}</span> : null}
							</div>
						) : null}
					</>
				) : (
					<>
						<div className={css.heroTitleLarge}>{title || ''}</div>
						{meta && <div className={css.heroMetaLine}>{meta}</div>}
					</>
				)}
				{synopsis ? (
					<VerticalMarquee
						className={css.heroSynopsis}
						text={synopsis}
						lines={3}
						lineHeight={SYNOPSIS_LINE_HEIGHT}
						pauseMs={1600}
					/>
				) : null}
			</div>
		</div>
	);
};

export default memo(GuideHero);
