import {useCallback, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import {useSettings} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import seerrApi from '../../services/seerrApi';
import {formatClockTime} from '../../utils/clock';
import {formatShortDayName} from '../../utils/dateFormat';
import {toCssColor, toCssColorWithAlpha} from '../../theme/themeSpec';
import {registerThemeSheet} from '../../theme/themeOverrides';
import {BADGE, PROBLEM, daysBetween, inLibrary, isEpisode, isMovie, playableId, statusAt} from '../../utils/calendarEntries';
import {CALENDAR_ICONS} from './calendarIcons';

import css from './Calendar.module.less';

registerThemeSheet('calendar', css);

// Labels, colors and actions every calendar view shares.

const MOVIE_COLOR = '#FFF2A93B';
export const READY_COLOR = '#FF5BC46A';
const MISSING_COLOR = '#FFE0A15A';
const MUTED_COLOR = '#99FFFFFF';
const CHIP_COLOR = '#BFFFFFFF';

// What has focus, by its spotlight id, so a view can put focus back there when Back returns to it.
export const focusedSpotlightId = () => {
	const node = Spotlight.getCurrent();
	return (node && node.getAttribute && node.getAttribute('data-spotlight-id')) || null;
};

/** Scrolls a focused row or card to the middle of its list. area is the part of the list that shows. */
export const centerIn = (scroller, node, horizontal = false, area = scroller) => {
	if (!scroller || !node) return;
	const r = node.getBoundingClientRect();
	const a = area.getBoundingClientRect();
	if (horizontal) scroller.scrollLeft += r.left + r.width / 2 - (a.left + a.width / 2);
	else scroller.scrollTop += r.top + r.height / 2 - (a.top + a.height / 2);
};

export const CalendarIcon = ({name, className}) => (
	<svg className={className || css.icon} viewBox="0 0 24 24" aria-hidden="true">
		<path fill="currentColor" d={CALENDAR_ICONS[name]} />
	</svg>
);

const SpottableButton = Spottable('button');

/** A pill that fills white on focus like the app's other TV buttons. */
export const CalendarButton = ({label, icon, primary, compact, disabled, accent, onClick, ...rest}) => (
	<SpottableButton
		className={`${css.button} ${compact ? css.compact : ''} ${primary ? css.primary : ''} ${disabled ? css.disabled : ''} ${label ? '' : css.iconOnly}`}
		style={primary && accent ? {backgroundColor: accent} : undefined}
		onClick={disabled ? undefined : onClick}
		aria-label={label || undefined}
		aria-disabled={disabled || undefined}
		{...rest}
	>
		{icon && <CalendarIcon name={icon} className={css.buttonIcon} />}
		{label && <span className={css.buttonLabel}>{label}</span>}
	</SpottableButton>
);

export const CalendarTag = ({label, color}) => (
	<span className={css.tag} style={{color: toCssColor(color), background: toCssColorWithAlpha(color, 0.18)}}>{label}</span>
);

// TMDB sizes the artwork by its path, and a thumbnail this small doesn't need the big file.
const thumbSized = (url) => (url ? url.replace(/\/t\/p\/(original|w\d+)\//, '/t/p/w300/') : null);

/** Artwork with a plain fallback, so a title with no art still holds its slot. */
export const CalendarArt = ({url, icon, className, thumb}) => {
	const [failed, setFailed] = useState(null);
	const src = url ? seerrApi.getImageUrl(thumb ? thumbSized(url) : url) : null;
	const handleError = useCallback(() => setFailed(src), [src]);
	return (
		<div className={`${css.art} ${className || ''}`}>
			{src && failed !== src ? (
				<img className={css.artImage} src={src} alt="" loading="lazy" onError={handleError} />
			) : (
				<CalendarIcon name={icon} className={css.artFallback} />
			)}
		</div>
	);
};

export const artIcon = (e) => (isMovie(e) ? 'movie_outlined' : 'tv_rounded');

export const calendarTime = (e, clockDisplay) => (e.hasTime ? formatClockTime(e.date, clockDisplay) : $L('All day'));

export const calendarDayName = (day, today, dateFormat) => {
	const diff = daysBetween(today, day);
	if (diff === 0) return $L('Today');
	if (diff === 1) return $L('Tomorrow');
	if (diff === -1) return $L('Yesterday');
	return formatShortDayName(day, dateFormat);
};

/** When it airs, like "Today at 9:00 PM", or the day alone for a movie. */
export const calendarWhen = (e, today, clockDisplay, dateFormat) => {
	const day = calendarDayName(e.day, today, dateFormat);
	if (!e.hasTime) return day;
	return $L('{day} at {time}').replace('{day}', day).replace('{time}', calendarTime(e, clockDisplay));
};

const badgeLabel = (badge) => {
	switch (badge) {
		case BADGE.seriesPremiere: return $L('Series premiere');
		case BADGE.seasonPremiere: return $L('New season');
		case BADGE.midseasonFinale: return $L('Midseason finale');
		case BADGE.seasonFinale: return $L('Finale');
		case BADGE.seriesFinale: return $L('Series finale');
		default: return null;
	}
};

const releaseLabel = (release) => {
	if (release === 'cinema') return $L('Cinema');
	if (release === 'digital') return $L('Digital');
	if (release === 'physical') return $L('Physical');
	return '';
};

/** The episode code and name, or the movie's release type and year. */
export const calendarSubtitle = (e, hideSpoilers) => {
	if (isMovie(e)) return [releaseLabel(e.release), e.year != null ? String(e.year) : null].filter(Boolean).join(' · ');
	const code = e.seasonNumber != null && e.episodeNumber != null ? `S${e.seasonNumber} E${e.episodeNumber}` : null;
	return [code, !hideSpoilers ? e.episodeTitle : null].filter(Boolean).join(' · ');
};

/** The Go to Series or Movie details button for an entry the actions can open. */
export const titleButton = (e, actions) => ({
	key: 'open',
	label: isEpisode(e) ? $L('Go to Series') : $L('Movie details'),
	icon: isEpisode(e) ? 'tv_rounded' : 'info_outline_rounded',
	onClick: () => actions.openTitle(e)
});

/** The episode still when spoilers allow it, otherwise the series or movie backdrop. */
export const thumbOf = (e, hideSpoilers) => (!hideSpoilers && e.stillUrl) || e.backdropUrl || e.posterUrl;

export const problemText = (problem, seerrLabel) => {
	switch (problem) {
		case PROBLEM.adminsOnly: return $L('The calendar is limited to admins on this server.');
		case PROBLEM.needsAdminSeerr: return $L('An admin needs to sign in to {seerr} in Moonfin before the calendar can load.').replace('{seerr}', seerrLabel || 'Seerr');
		case PROBLEM.notConfigured: return $L('No Sonarr or Radarr server is linked yet.');
		default: return $L("Couldn't load the calendar.");
	}
};

/** The theme accent and the per entry color and tags, which all follow the Look settings. */
export const useCalendarLook = () => {
	const {settings, activeTheme} = useSettings();
	const accentHex = activeTheme.colors.accent;
	const backgroundHex = activeTheme.colors.background;
	const byStatus = settings.calendarColorBy === 'status';
	const badges = settings.calendarShowBadges !== false;
	return useMemo(() => {
		const colorHex = (e, now) => {
			if (byStatus) {
				const status = statusAt(e, now);
				if (status === 'ready') return READY_COLOR;
				if (status === 'missing') return MISSING_COLOR;
				return accentHex;
			}
			return isMovie(e) ? MOVIE_COLOR : accentHex;
		};
		return {
			accent: toCssColor(accentHex),
			accentHex,
			accentA: (alpha) => toCssColorWithAlpha(accentHex, alpha),
			bg: (alpha) => toCssColorWithAlpha(backgroundHex, alpha),
			badges,
			color: (e, now) => toCssColor(colorHex(e, now)),
			badgeOf: (e) => (badges ? badgeLabel(e.badge) : null),
			tags: (e, now) => {
				const out = [];
				const badge = badges ? badgeLabel(e.badge) : null;
				if (badge) out.push({label: badge, color: accentHex});
				if (inLibrary(e)) out.push({label: $L('In library'), color: READY_COLOR});
				else if (statusAt(e, now) === 'missing') out.push({label: $L('Missing'), color: MISSING_COLOR});
				if (!e.monitored) out.push({label: $L('Not monitored'), color: MUTED_COLOR});
				return out;
			},
			chips: (e) => [
				e.network ? {label: e.network, color: CHIP_COLOR} : null,
				e.runtimeMinutes > 0 ? {label: $L('{minutes} min').replace('{minutes}', String(e.runtimeMinutes)), color: CHIP_COLOR} : null
			].filter(Boolean)
		};
	}, [accentHex, backgroundHex, byStatus, badges]);
};

/**
 * What OK and the buttons do. The episode or movie page when it's on the server, the series page for
 * an episode that isn't yet, and the Seerr page for a title the server lacks.
 */
export const useCalendarActions = ({onSelectItem, onSelectSeerrItem}) => {
	const {settings} = useSettings();
	const {isEnabled: seerrAvailable} = useSeerr();
	const playOnSelect = settings.calendarSelectAction === 'play';
	const requestButton = settings.calendarRequestButton !== false;
	return useMemo(() => {
		const openSeerr = (e) => {
			if (!seerrAvailable || e.tmdbId == null) return;
			onSelectSeerrItem?.({mediaId: e.tmdbId, mediaType: isMovie(e) ? 'movie' : 'tv', title: e.title});
		};
		const play = (e) => {
			const id = playableId(e);
			if (id) onSelectItem?.({Id: id, Type: isEpisode(e) ? 'Episode' : 'Movie'}, true);
		};
		const openDetails = (e) => {
			if (e.episodeId) onSelectItem?.({Id: e.episodeId, Type: 'Episode'});
			else if (e.itemId) onSelectItem?.({Id: e.itemId, Type: isEpisode(e) ? 'Series' : 'Movie'});
			else openSeerr(e);
		};
		const openSeries = (e) => {
			if (e.itemId) onSelectItem?.({Id: e.itemId, Type: 'Series'});
			else openSeerr(e);
		};
		return {
			play,
			request: openSeerr,
			select: (e) => (playOnSelect && inLibrary(e) ? play(e) : openDetails(e)),
			// Go to Series for an episode, Movie details for a movie.
			openTitle: (e) => (isEpisode(e) ? openSeries(e) : openDetails(e)),
			canOpen: (e) => Boolean(e.itemId || e.episodeId || (seerrAvailable && e.tmdbId != null)),
			// The request button belongs on titles Sonarr or Radarr won't fetch.
			showsRequest: (e) => !e.monitored && !inLibrary(e) && e.tmdbId != null && seerrAvailable && requestButton
		};
	}, [onSelectItem, onSelectSeerrItem, seerrAvailable, playOnSelect, requestButton]);
};
