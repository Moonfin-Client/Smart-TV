import {useState, useEffect, useRef, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import {fetchRatings, fetchEpisodeRatings, buildDisplayRatings, getContentType, getTmdbId, getSelectionSource, isRatingSourceEnabled} from '../../services/mdblistApi';
import {useSettings} from '../../context/SettingsContext';
import {normalizeRatingStyle, personalRatingOf} from '../../utils/personalRating';
import {getRtFallbackIcon} from '../icons/rtIcons';
import css from './RatingsRow.module.less';

const RatingsRow = ({item, serverUrl, compact = false, pluginEnabled = true}) => {
	const {settings} = useSettings();
	const showLabels = settings.showRatingLabels !== false;
	// Badges only choose the chip chrome around each rating. Off means plain, not hidden.
	const showBadges = settings.showRatingBadges !== false;
	const enabledSources = settings.mdblistRatingSources;
	const [allRatings, setAllRatings] = useState([]);
	const mountedRef = useRef(true);
	const itemIdRef = useRef(null);

	useEffect(() => {
		mountedRef.current = true;
		return () => { mountedRef.current = false; };
	}, []);

	const sourcesKey = Array.isArray(enabledSources) ? enabledSources.join(',') : '';
	const episodeRatingsEnabled = settings.tmdbEpisodeRatingsEnabled === true && isRatingSourceEnabled(settings, 'tmdb');

	useEffect(() => {
		if (!pluginEnabled || !item || !serverUrl) {
			setAllRatings([]);
			return;
		}

		const currentItemId = item.Id;
		itemIdRef.current = currentItemId;
		const controller = new AbortController();

		const apply = (ratings) => {
			if (mountedRef.current && itemIdRef.current === currentItemId) {
				setAllRatings(buildDisplayRatings(ratings, serverUrl));
			}
		};

		// Episodes have no MDBList ratings, so show the TMDB episode rating when
		// that feature is on. Seasons show nothing.
		if (item.Type === 'Episode') {
			if (episodeRatingsEnabled) {
				fetchEpisodeRatings(serverUrl, item, {signal: controller.signal}).then(apply);
			} else {
				setAllRatings([]);
			}
			return () => controller.abort();
		}

		const contentType = getContentType(item);
		const tmdbId = getTmdbId(item);
		if (!contentType || (!tmdbId && item.Type !== 'Series')) {
			setAllRatings([]);
			return;
		}

		fetchRatings(serverUrl, item, {signal: controller.signal, sourcesKey}).then(apply);
		return () => controller.abort();
	}, [item, serverUrl, pluginEnabled, episodeRatingsEnabled, sourcesKey]);

	const displayRatings = useMemo(() => {
		if (!Array.isArray(enabledSources)) return allRatings;
		return allRatings
			.filter(r => enabledSources.includes(getSelectionSource(r.source)))
			.sort((a, b) => enabledSources.indexOf(getSelectionSource(a.source)) - enabledSources.indexOf(getSelectionSource(b.source)));
	}, [allRatings, enabledSources]);

	// The viewer's own score leads the row, formatted the way their chosen
	// rating style reads. It never waits on the plugin, since it comes from the
	// server's user data on the item itself.
	const personalValue = isRatingSourceEnabled(settings, 'personal') && item ? personalRatingOf(item.UserData) : null;
	const personalRating = personalValue === null ? null : (
		normalizeRatingStyle(settings.personalRatingStyle) === 'stars' ? `${(personalValue / 2).toFixed(1)}/5` : personalValue.toFixed(1)
	);
	const communityRating = isRatingSourceEnabled(settings, 'stars') && item && item.CommunityRating ? item.CommunityRating.toFixed(1) : null;
	// The server's own critic rating stands in until plugin ratings actually
	// arrive, so it stays visible when there's no API key or nothing came back.
	const showCriticRating = allRatings.length === 0 && item && item.CriticRating != null;
	const hasContent = personalRating || communityRating || displayRatings.length > 0 || showCriticRating;
	if (!hasContent) return null;

	if (compact) {
		const compactClass = `${css.ratingCompact}${showBadges ? ' ' + css.ratingCompactBadge : ''}`;
		return (
			<div className={css.ratingsRowCompact}>
				{personalRating && (
					<span className={compactClass}>
						<span className={css.ratingTopCompact}>
							<span className={css.personalStarCompact}>{"\u2605"}</span>
							<span className={css.ratingValueCompact}>{personalRating}</span>
						</span>
						{showLabels && <span className={css.ratingNameCompact}>{$L('My Rating')}</span>}
					</span>
				)}
				{communityRating && (
					<span className={compactClass}>
						<span className={css.ratingTopCompact}>
							<span className={css.communityStarCompact}>{"\u2605"}</span>
							<span className={css.ratingValueCompact}>{communityRating}</span>
						</span>
						{showLabels && <span className={css.ratingNameCompact}>{$L('Community')}</span>}
					</span>
				)}
				{showCriticRating && (
					<span className={compactClass}>
						<span className={css.ratingTopCompact}>
							<img
								className={css.ratingIconCompact}
								src={getRtFallbackIcon(item.CriticRating)}
								alt={$L('Rotten Tomatoes')}
							/>
							<span className={css.ratingValueCompact}>{item.CriticRating}%</span>
						</span>
						{showLabels && <span className={css.ratingNameCompact}>{$L('Rotten Tomatoes')}</span>}
					</span>
				)}
				{displayRatings.map(r => (
					<span key={r.source} className={compactClass}>
						<span className={css.ratingTopCompact}>
							<img
								className={css.ratingIconCompact}
								src={r.iconUrl}
								alt={r.name}
								title={r.name}
							/>
							<span className={css.ratingValueCompact}>{r.formatted}</span>
						</span>
						{showLabels && <span className={css.ratingNameCompact}>{r.name}</span>}
					</span>
				))}
			</div>
		);
	}

	const itemClass = `${css.ratingItem}${showBadges ? '' : ' ' + css.ratingItemPlain}`;
	return (
		<div className={css.ratingsRow}>
			{personalRating && (
				<div className={itemClass}>
					<div className={css.ratingTop}>
						<span className={css.personalStar}>{"\u2605"}</span>
						<span className={css.ratingValue}>{personalRating}</span>
					</div>
					{showLabels && <span className={css.ratingName}>{$L('My Rating')}</span>}
				</div>
			)}
			{communityRating && (
				<div className={itemClass}>
					<div className={css.ratingTop}>
						<span className={css.communityStar}>{"\u2605"}</span>
						<span className={css.ratingValue}>{communityRating}</span>
					</div>
					{showLabels && <span className={css.ratingName}>{$L('Community')}</span>}
				</div>
			)}
			{showCriticRating && (
				<div className={itemClass}>
					<div className={css.ratingTop}>
						<img
							className={css.ratingIcon}
							src={getRtFallbackIcon(item.CriticRating)}
							alt={$L('Rotten Tomatoes')}
						/>
						<span className={css.ratingValue}>{item.CriticRating}%</span>
					</div>
					{showLabels && <span className={css.ratingName}>{$L('Rotten Tomatoes')}</span>}
				</div>
			)}
			{displayRatings.map(r => (
				<div key={r.source} className={itemClass}>
					<div className={css.ratingTop}>
						<img
							className={css.ratingIcon}
							src={r.iconUrl}
							alt={r.name}
							title={r.name}
						/>
						<span className={css.ratingValue}>{r.formatted}</span>
					</div>
					{showLabels && <span className={css.ratingName}>{r.name}</span>}
				</div>
			))}
		</div>
	);
};

export default RatingsRow;
