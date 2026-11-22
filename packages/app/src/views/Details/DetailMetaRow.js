import {useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';

import {SeerrStatusBadge} from '../../components/seerr/SeerrStatusBadge';
import {isRatingSourceAllowed} from '../../services/mdblistApi';
import {arrange} from '../../utils/buttonLayout';
import {DETAIL_METADATA} from '../../utils/detailMetadataLayout';
import {formatDuration} from '../../utils/helpers';
import {fetchUpcomingEpisode, formatUpcomingEpisode} from '../../utils/upcomingEpisode';
import {DETAIL_ICON_PATHS} from './detailIcons';

import css from './ModernDetailContent.module.less';

const NO_TRACKS = [];

// The facts line under the title on Modern and Stage, in the order and with the pieces the viewer
// picked under Metadata Row. A playlist counts whatever its screen is showing, so the host passes
// those tracks in. A host that already names the episode by its number turns that off, and the
// episode's runtime takes its place. A host drawing the row its own way passes its own `classes`,
// and `trailing` is a last piece of its own, like the file size.
const DetailMetaRow = ({
	item, settings, seerr, year, officialRating, runtime, endsAt, seasonCount, genres = [], episodes = [],
	episodeRatings, effectiveServerUrl, serverToken, playlistTracks = NO_TRACKS, numbersEpisode = true,
	classes = css, trailing, genreSeparator = ' · '
}) => {
	const isSeries = item.Type === 'Series';
	const isSeason = item.Type === 'Season';
	const isEpisode = item.Type === 'Episode';
	const isPlaylist = item.Type === 'Playlist';

	const [upcomingEpisode, setUpcomingEpisode] = useState(null);

	useEffect(() => {
		let cancelled = false;
		if (!isSeries && !isSeason) {
			setUpcomingEpisode(null);
			return undefined;
		}
		fetchUpcomingEpisode({item, settings, serverUrl: effectiveServerUrl, serverToken})
			.then((res) => {
				if (!cancelled) setUpcomingEpisode(res);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [item, isSeries, isSeason, settings, effectiveServerUrl, serverToken]);

	const upcomingEpisodeText = useMemo(() => formatUpcomingEpisode(upcomingEpisode), [upcomingEpisode]);

	// A piece carries its kind so the status can render as a colored pill and the runtime can lead
	// with a clock.
	const metaPieces = useMemo(() => {
		const orderedItems = arrange(DETAIL_METADATA, {
			order: settings.detailMetadataOrderTv,
			hidden: settings.hiddenDetailMetadataTv
		});

		const pieceFor = (id) => {
			switch (id) {
				case 'year':
					return year ? [{kind: 'text', text: String(year)}] : [];
				case 'parentalRating':
					return officialRating ? [{kind: 'text', text: officialRating, rating: true}] : [];
				case 'runtimeAndSeasons': {
					const parts = [];
					if (isSeries && seasonCount) {
						parts.push({kind: 'text', text: $L('{count} Seasons').replace('{count}', seasonCount)});
					} else if (isSeason && episodes.length) {
						parts.push({kind: 'text', text: $L('{count} Episodes').replace('{count}', episodes.length)});
					} else if (numbersEpisode && isEpisode && item.ParentIndexNumber != null && item.IndexNumber != null) {
						let label = `S${item.ParentIndexNumber}:E${item.IndexNumber}`;
						const rating = episodeRatings?.[item.IndexNumber];
						const showEpisodeRating = settings.tmdbEpisodeRatingsEnabled && isRatingSourceAllowed(settings.mdblistRatingSources, 'tmdb');
						if (showEpisodeRating && rating) label += ` · ${rating}`;
						parts.push({kind: 'text', text: label});
					} else if (isPlaylist) {
						const count = playlistTracks.length;
						const totalTicks = playlistTracks.reduce((sum, t) => sum + (t.RunTimeTicks || 0), 0);
						parts.push({kind: 'text', text: `${count} ${count !== 1 ? $L('Items') : $L('Item')}`});
						if (totalTicks > 0) parts.push({kind: 'runtime', text: formatDuration(totalTicks)});
					} else if (runtime) {
						parts.push({kind: 'runtime', text: runtime});
						if (endsAt) parts.push({kind: 'text', text: endsAt});
					}
					return parts;
				}
				case 'status':
					if (isSeries && item.Status === 'Continuing') return [{kind: 'status', text: $L('Continuing')}];
					if (isSeries && item.Status === 'Ended') return [{kind: 'status', text: $L('Ended'), ended: true}];
					return [];
				case 'upcomingEpisodeDate':
					if (upcomingEpisodeText) return [{kind: 'upcoming', text: upcomingEpisodeText}];
					return [];
				case 'genres':
					return genres.length ? [{kind: 'text', text: genres.slice(0, 3).join(genreSeparator)}] : [];
				case 'seerrAvailability':
					return seerr.statusPills?.length > 0 ? [{kind: 'seerr'}] : [];
				default:
					return [];
			}
		};

		return orderedItems.flatMap((itemDef) => pieceFor(itemDef.id));
	}, [settings.detailMetadataOrderTv, settings.hiddenDetailMetadataTv, year, officialRating, isSeries, seasonCount, isSeason, episodes.length, isEpisode, item.ParentIndexNumber, item.IndexNumber, item.Status, episodeRatings, settings.tmdbEpisodeRatingsEnabled, settings.mdblistRatingSources, runtime, endsAt, genres, upcomingEpisodeText, seerr.statusPills, isPlaylist, playlistTracks, numbersEpisode, genreSeparator]);

	const pieces = trailing ? [...metaPieces, {kind: 'text', text: trailing}] : metaPieces;
	if (!pieces.length) return null;

	return (
		<div className={classes.metaRow}>
			{pieces.map((piece, i) => {
				// Modern sets its pills apart with a gap of their own, where another host separates
				// them like any other piece.
				if (piece.kind === 'seerr') {
					const badge = <SeerrStatusBadge key={i} seerr={seerr} className={classes.metaBadge} />;
					return classes === css ? badge : <span key={i} className={classes.metaItem}>{badge}</span>;
				}
				return (
					<span key={i} className={classes.metaItem}>
						{piece.kind === 'runtime' && (
							<svg className={classes.metaIcon} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
								<path d={DETAIL_ICON_PATHS.schedule} />
							</svg>
						)}
						{piece.kind === 'upcoming' && (
							<span className={`${classes.statusBadge} ${classes.statusUpcoming}`}>
								<svg className={classes.metaIcon} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
									<path d={DETAIL_ICON_PATHS.calendar} />
								</svg>
								{piece.text}
							</span>
						)}
						{piece.kind === 'status' && (
							<span className={`${classes.statusBadge} ${piece.ended ? classes.statusEnded : ''}`}>{piece.text}</span>
						)}
						{(piece.kind === 'text' || piece.kind === 'runtime') && (piece.rating && classes.metaRating
							? <span className={classes.metaRating}>{piece.text}</span>
							: piece.text)}
					</span>
				);
			})}
		</div>
	);
};

export default DetailMetaRow;
