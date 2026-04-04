import {useState, useEffect, useRef, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import {fetchRatings, buildDisplayRatings, getContentType, getTmdbId} from '../../services/mdblistApi';
import {useSettings} from '../../context/SettingsContext';
import {getRtFallbackIcon} from '../icons/rtIcons';
import css from './RatingsRow.module.less';

const RatingsRow = ({item, serverUrl, compact = false, pluginEnabled = true}) => {
	const {settings} = useSettings();
	const showLabels = settings.showRatingLabels !== false;
	const enabledSources = settings.mdblistRatingSources;
	const [allRatings, setAllRatings] = useState([]);
	const mountedRef = useRef(true);
	const itemIdRef = useRef(null);

	useEffect(() => {
		mountedRef.current = true;
		return () => { mountedRef.current = false; };
	}, []);

	useEffect(() => {
		if (!pluginEnabled || !item || !serverUrl) {
			setAllRatings([]);
			return;
		}

		const contentType = getContentType(item);
		const tmdbId = getTmdbId(item);

		if (!contentType || !tmdbId) {
			setAllRatings([]);
			return;
		}

		const currentItemId = item.Id;
		itemIdRef.current = currentItemId;

		fetchRatings(serverUrl, item).then(ratings => {
			if (mountedRef.current && itemIdRef.current === currentItemId) {
				setAllRatings(buildDisplayRatings(ratings, serverUrl));
			}
		});
	}, [item, serverUrl, pluginEnabled]);

	const displayRatings = useMemo(() => {
		if (!Array.isArray(enabledSources)) return allRatings;
		return allRatings
			.filter(r => enabledSources.includes(r.source))
			.sort((a, b) => enabledSources.indexOf(a.source) - enabledSources.indexOf(b.source));
	}, [allRatings, enabledSources]);

	const communityRating = item && item.CommunityRating ? item.CommunityRating.toFixed(1) : null;
	const hasContent = communityRating || displayRatings.length > 0 || (!pluginEnabled && item && item.CriticRating);
	if (!hasContent) return null;

	if (compact) {
		return (
			<div className={css.ratingsRowCompact}>
				{communityRating && (
					<span className={css.ratingCompact}>
						<span className={css.communityStarCompact}>{"\u2605"}</span>
						<span className={css.ratingValueCompact}>{communityRating}</span>
					</span>
				)}
				{!pluginEnabled && item.CriticRating != null && (
					<span className={css.ratingCompact}>
						<img
							className={css.ratingIconCompact}
							src={getRtFallbackIcon(item.CriticRating)}
							alt="Rotten Tomatoes"
						/>
						<span className={css.ratingValueCompact}>{item.CriticRating}%</span>
					</span>
				)}
				{displayRatings.map(r => (
					<span key={r.source} className={css.ratingCompact}>
						<img
							className={css.ratingIconCompact}
							src={r.iconUrl}
							alt={r.name}
							title={r.name}
						/>
						<span className={css.ratingValueCompact}>{r.formatted}</span>
					</span>
				))}
			</div>
		);
	}

	return (
		<div className={css.ratingsRow}>
			{communityRating && (
				<div className={css.ratingItem}>
					<span className={css.communityStar}>{"\u2605"}</span>
					<div className={css.ratingInfo}>
						<span className={css.ratingValue}>{communityRating}</span>
						{showLabels && <span className={css.ratingName}>{$L('Community')}</span>}
					</div>
				</div>
			)}
			{!pluginEnabled && item.CriticRating != null && (
				<div className={css.ratingItem}>
					<img
						className={css.ratingIcon}
						src={getRtFallbackIcon(item.CriticRating)}
						alt="Rotten Tomatoes"
					/>
					<div className={css.ratingInfo}>
						<span className={css.ratingValue}>{item.CriticRating}%</span>
						{showLabels && <span className={css.ratingName}>Rotten Tomatoes</span>}
					</div>
				</div>
			)}
			{displayRatings.map(r => (
				<div key={r.source} className={css.ratingItem}>
					<img
						className={css.ratingIcon}
						src={r.iconUrl}
						alt={r.name}
						title={r.name}
					/>
					<div className={css.ratingInfo}>
						<span className={css.ratingValue}>{r.formatted}</span>
						{showLabels && <span className={css.ratingName}>{r.name}</span>}
					</div>
				</div>
			))}
		</div>
	);
};

export default RatingsRow;
