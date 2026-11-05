import {Fragment, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';

import RatingsRow from '../../../../components/RatingsRow';
import {IncompleteDetailLine} from '../../../../components/IncompleteBadge';
import {SeerrStatusBadge} from '../../../../components/seerr/SeerrStatusBadge';
import {isMdblistEnabled} from '../../../../services/mdblistApi';
import {formatPlaybackEndsAt} from '../../../../utils/playbackTimeLabels';
import {fetchUpcomingEpisode, formatUpcomingEpisode} from '../../../../utils/upcomingEpisode';
import {hidesMediaDescription} from '../../detailsMedia';
import ExpandableOverview from '../../ExpandableOverview';
import {nouveauMetaPieces} from '../nouveauMetaPieces';
import NouveauActionRow from './NouveauActionRow';

import css from './NouveauHero.module.less';

const TICKS_PER_SECOND = 10000000;

// A season is watched through in a sitting, so it is worth saying when it would finish. The server
// gives no runtime for the season itself, so it comes from adding up the episodes it holds.
const seasonEndsAt = (episodes, settings) => {
	const ticks = episodes.reduce((total, episode) => total + (episode.RunTimeTicks || 0), 0);
	if (!ticks) return '';
	return formatPlaybackEndsAt(ticks / TICKS_PER_SECOND, settings.clockDisplay, settings.timeOffsetHours);
};

// The top of the Nouveau page. One left aligned column over the backdrop, read top to bottom: what
// the title is, what state it is in, the facts about it, what the file is, how it was rated, what
// it is about, and then what can be done with it.
const NouveauHero = (props) => {
	const {
		item, settings, showsSection, seerr, genres = [], year, officialRating, runtime, seasonCount,
		episodes = [], techBadges = [], techSize, logoUrl, onLogoError,
		effectiveServerUrl, serverToken, overviewBackRef, isPerson
	} = props;

	const isSeason = item.Type === 'Season';
	const isSeries = item.Type === 'Series';
	const genreLine = genres.slice(0, 3).join(' · ');
	// An episode and a season carry no genres of their own, so the row is held open rather than
	// letting the title jump up the screen when moving between one and its series.
	const reserveGenres = !genreLine && (item.Type === 'Episode' || isSeason);

	const status = isSeries && (item.Status === 'Ended' || item.Status === 'Continuing')
		? item.Status
		: null;

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

	const upcomingText = useMemo(() => formatUpcomingEpisode(upcomingEpisode), [upcomingEpisode]);

	const hasBadges = Boolean(status) || Boolean(upcomingText) || seerr?.statusPills?.length > 0;

	const pieces = nouveauMetaPieces({
		item, year, officialRating, runtime, seasonCount,
		episodeCount: episodes.length,
		endsAt: isSeason ? seasonEndsAt(episodes, settings) : '',
		showsBirthplace: showsSection('birthplace')
	});

	// On a person the overview is the biography, which has a switch of its own.
	const showsOverview = Boolean(item.Overview) && !hidesMediaDescription(item, settings) &&
		(!isPerson || showsSection('biography'));

	const renderBranding = () => {
		if (!logoUrl) return <h1 className={css.title}>{item.Name}</h1>;

		// A season's logo belongs to its series, so the season's own name goes beside it.
		if (isSeason) {
			return (
				<div className={css.branding}>
					<img className={css.logoCompanion} src={logoUrl} onError={onLogoError} alt="" />
					<span className={css.companionTitle}>{item.Name}</span>
				</div>
			);
		}

		return (
			<div className={css.branding}>
				<img className={css.logo} src={logoUrl} onError={onLogoError} alt="" />
			</div>
		);
	};

	return (
		<div className={css.hero}>
			{genreLine && <div className={css.genres}>{genreLine}</div>}
			{reserveGenres && <div className={css.genresReserved} />}
			{renderBranding()}
			{hasBadges && (
				<div className={css.badges}>
					{status && (
						<span className={`${css.statusBadge} ${status === 'Ended' ? css.statusEnded : css.statusContinuing}`}>
							{status === 'Ended' ? $L('Ended') : $L('Continuing')}
						</span>
					)}
					{upcomingText && (
						<span className={`${css.statusBadge} ${css.statusUpcoming}`}>{upcomingText}</span>
					)}
					<SeerrStatusBadge seerr={seerr} />
				</div>
			)}
			{pieces.length > 0 && (
				<div className={css.meta}>
					{pieces.map((text, index) => (
						<Fragment key={index}>
							{index > 0 && <span className={css.metaSeparator}>·</span>}
							<span className={css.metaText}>{text}</span>
						</Fragment>
					))}
				</div>
			)}
			<IncompleteDetailLine itemId={item.Id} clockDisplay={settings.clockDisplay} />
			{(techBadges.length > 0 || techSize) && (
				<div className={css.tech}>
					{techBadges.map((badge, i) => <span key={i} className={css.techChip}>{badge.label}</span>)}
					{techSize && <span className={css.techChip}>{techSize}</span>}
				</div>
			)}
			{!isPerson && (
				<div className={css.ratings}>
					<RatingsRow item={item} serverUrl={effectiveServerUrl} pluginEnabled={isMdblistEnabled(settings)} />
				</div>
			)}
			{showsOverview && (
				<ExpandableOverview
					text={item.Overview}
					itemId={item.Id}
					className={css.overview}
					variant="nouveau"
					spotlightId="nouveau-overview"
					backRef={overviewBackRef}
				/>
			)}
			<NouveauActionRow {...props} />
		</div>
	);
};

export default NouveauHero;
