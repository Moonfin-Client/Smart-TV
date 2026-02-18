import {useState, useEffect, useRef} from 'react';
import {fetchRatings, buildDisplayRatings, getContentType, getTmdbId} from '../../services/mdblistApi';
import {useSettings} from '../../context/SettingsContext';
import css from './RatingsRow.module.less';

const RatingsRow = ({item, serverUrl, compact = false}) => {
	const {settings} = useSettings();
	const [displayRatings, setDisplayRatings] = useState([]);
	const mountedRef = useRef(true);
	const itemIdRef = useRef(null);

	useEffect(() => {
		mountedRef.current = true;
		return () => { mountedRef.current = false; };
	}, []);

	useEffect(() => {
		if (!item || !serverUrl) {
			setDisplayRatings([]);
			return;
		}

		const contentType = getContentType(item);
		const tmdbId = getTmdbId(item);

		if (!contentType || !tmdbId) {
			setDisplayRatings([]);
			return;
		}

		const currentItemId = item.Id;
		itemIdRef.current = currentItemId;

		fetchRatings(serverUrl, item).then(ratings => {
			if (mountedRef.current && itemIdRef.current === currentItemId) {
				const sources = settings.mdblistRatingSources || ['imdb', 'tmdb', 'tomatoes', 'metacritic'];
				const display = buildDisplayRatings(ratings, serverUrl, sources);
				setDisplayRatings(display);
			}
		});
	}, [item, serverUrl, settings.mdblistRatingSources]);

	if (displayRatings.length === 0) return null;

	if (compact) {
		return (
			<div className={css.ratingsRowCompact}>
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
						<span className={css.ratingName}>{r.name}</span>
					</div>
				</div>
			))}
		</div>
	);
};

export default RatingsRow;
