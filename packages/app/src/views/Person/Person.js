import {useState, useEffect, useCallback, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import {withoutBlockedItems} from '../../services/parentalControls';
import MediaRow from '../../components/MediaRow';
import LoadingSpinner from '../../components/LoadingSpinner';
import PersonDetailShell from '../../components/PersonDetailShell';
import PersonDisplayDialog from '../Details/PersonDisplayDialog';
import usePersonSeerrCredits from '../../hooks/usePersonSeerrCredits';
import {useUserDataList} from '../../hooks/useUserDataSync';
import {getImageUrl} from '../../utils/helpers';
import {personDateLines, splitFilmography, withPersonRoles} from '../../utils/personCredits';
import {sectionVisibility} from '../../utils/detailSectionLayout';

import css from './Person.module.less';

const TUNE_ICON = 'M3 17.02V18.98H9V17.02H3ZM3 5.02V6.98H12.98V5.02H3ZM12.98 21V18.98H21V17.02H12.98V15H11.02V21H12.98ZM6.98 9V11.02H3V12.98H6.98V15H9V9H6.98ZM21 12.98V11.02H11.02V12.98H21ZM15 9H17.02V6.98H21V5.02H17.02V3H15V9Z';

// Same shell as SeerrPerson (a TMDB-only person). This one has a Jellyfin
// person record and its own library filmography, so it adds a favorite
// button and a way to jump to the Seerr side. The backdrop, portrait,
// overview and tab bar all come from the shared PersonDetailShell.
const Person = ({personId, onSelectItem, onSelectSeerrItem, onSelectSeerrPerson, backHandlerRef}) => {
	const {api, serverUrl} = useAuth();
	const {settings} = useSettings();
	// The detail sections setting reaches this page too, since it stands in for the Details
	// screen on a person under every style but Nouveau.
	const showsSection = useMemo(() => sectionVisibility(settings.hiddenDetailSectionsTv), [settings.hiddenDetailSectionsTv]);
	const [person, setPerson] = useState(null);
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [showDisplay, setShowDisplay] = useState(false);

	useEffect(() => {
		const loadPerson = async () => {
			try {
				const [personData, itemsData] = await Promise.all([
					api.getPerson(personId),
					api.getItemsByPerson(personId)
				]);
				setPerson(personData);
				setItems(withPersonRoles(withoutBlockedItems(itemsData.Items || []), personId));
			} catch (err) {
				console.error('Failed to load person:', err);
			} finally {
				setIsLoading(false);
			}
		};

		if (personId) {
			loadPerson();
		}
	}, [api, personId]);

	const tmdbId = person?.ProviderIds?.Tmdb;
	const {appearances, crewCredits, seerrEnabled} = usePersonSeerrCredits(tmdbId);

	const handleSelectCredit = useCallback((item) => {
		if (item?._seerrRaw) onSelectSeerrItem?.(item._seerrRaw);
	}, [onSelectSeerrItem]);

	const handleToggleFavorite = useCallback(async () => {
		if (!person) return;
		const newVal = !person.UserData?.IsFavorite;
		try {
			await api.setFavorite(person.Id, newVal);
			setPerson(prev => ({
				...prev,
				UserData: {...prev.UserData, IsFavorite: newVal}
			}));
		} catch { /* ignore */ }
	}, [api, person]);

	const handleOpenSeerr = useCallback(() => {
		if (tmdbId) onSelectSeerrPerson?.(tmdbId, person?.Name);
	}, [tmdbId, person, onSelectSeerrPerson]);

	const openDisplay = useCallback(() => setShowDisplay(true), []);
	const closeDisplay = useCallback(() => setShowDisplay(false), []);

	useEffect(() => {
		if (!backHandlerRef || !showDisplay) return undefined;
		const handler = () => {
			closeDisplay();
			return true;
		};
		backHandlerRef.current = handler;
		return () => {
			if (backHandlerRef.current === handler) backHandlerRef.current = null;
		};
	}, [backHandlerRef, showDisplay, closeDisplay]);

	const syncedItems = useUserDataList(items);
	const {movies, series, guestAppearances, musicVideos} = useMemo(
		() => splitFilmography(syncedItems, showsSection, settings.personPageSortOption),
		[syncedItems, showsSection, settings.personPageSortOption]
	);

	const backdropCandidates = useMemo(() => {
		const urls = [];
		for (const f of [...movies, ...series]) {
			if (f.ImageTags?.Backdrop) {
				urls.push(getImageUrl(serverUrl, f.Id, 'Backdrop', {maxWidth: 1920}));
			}
		}
		return urls;
	}, [movies, series, serverUrl]);

	const randomBackdrop = useMemo(() => {
		if (backdropCandidates.length === 0) return null;
		return backdropCandidates[Math.floor(Math.random() * backdropCandidates.length)];
	}, [backdropCandidates]);

	const tabs = useMemo(() => {
		const list = [];
		if (movies.length > 0) {
			list.push({key: 'movies', label: $L('Movies'), content: (
				<MediaRow title={`${$L('Movies')} (${movies.length})`} items={movies} serverUrl={serverUrl} cardType="portrait" onSelectItem={onSelectItem} rowId="person-movies" />
			)});
		}
		if (series.length > 0) {
			list.push({key: 'series', label: $L('Series'), content: (
				<MediaRow title={`${$L('Series')} (${series.length})`} items={series} serverUrl={serverUrl} cardType="portrait" onSelectItem={onSelectItem} rowId="person-series" />
			)});
		}
		if (guestAppearances.length > 0) {
			list.push({key: 'guest', label: $L('Guest Appearances'), content: (
				<MediaRow title={`${$L('Guest Appearances')} (${guestAppearances.length})`} items={guestAppearances} serverUrl={serverUrl} cardType="landscape" onSelectItem={onSelectItem} rowId="person-guest" />
			)});
		}
		if (musicVideos.length > 0) {
			list.push({key: 'music', label: $L('Music Videos'), content: (
				<MediaRow title={`${$L('Music Videos')} (${musicVideos.length})`} items={musicVideos} serverUrl={serverUrl} cardType="portrait" onSelectItem={onSelectItem} rowId="person-music" />
			)});
		}
		if (showsSection('seerrPersonCrew') && crewCredits.length > 0) {
			list.push({key: 'crew', label: $L('Crew Contributions (Seerr)'), content: (
				<MediaRow title={`${$L('Crew Contributions (Seerr)')} (${crewCredits.length})`} items={crewCredits} serverUrl={serverUrl} cardType="portrait" onSelectItem={handleSelectCredit} rowId="person-crew" />
			)});
		}
		if (showsSection('seerrPersonAppearances') && appearances.length > 0) {
			list.push({key: 'seerr', label: $L('Appearances (Seerr)'), content: (
				<MediaRow title={`${$L('Appearances (Seerr)')} (${appearances.length})`} items={appearances} serverUrl={serverUrl} cardType="portrait" onSelectItem={handleSelectCredit} rowId="person-seerr" />
			)});
		}
		return list;
	}, [movies, series, guestAppearances, musicVideos, crewCredits, appearances, showsSection, onSelectItem, handleSelectCredit, serverUrl]);

	if (isLoading) {
		return (
			<div className={css.page}>
				<LoadingSpinner />
			</div>
		);
	}

	if (!person) {
		return (
			<div className={css.page}>
				<div className={css.empty}>{$L('Person not found')}</div>
			</div>
		);
	}

	const imageUrl = person.ImageTags?.Primary
		? getImageUrl(serverUrl, person.Id, 'Primary', {maxHeight: 450, quality: 90, tag: person.ImageTags.Primary})
		: null;
	const dateLines = personDateLines(person.PremiereDate, person.EndDate);
	const birthPlace = showsSection('birthplace') ? person.ProductionLocations?.[0] : null;
	const showSeerrButton = Boolean(tmdbId && seerrEnabled && onSelectSeerrPerson);

	const favoriteIcon = (
		<svg className={`${css.actionIcon} ${person.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
			<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z" />
		</svg>
	);

	const actions = [
		{key: 'favorite', label: person.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite'), icon: favoriteIcon, onClick: handleToggleFavorite}
	];
	if (showSeerrButton) {
		actions.push({key: 'seerr', label: $L('Seerr'), icon: null, onClick: handleOpenSeerr});
	}
	actions.push({
		key: 'display',
		label: $L('Display'),
		icon: <svg className={css.actionIcon} viewBox="0 0 24 24" fill="currentColor"><path d={TUNE_ICON} /></svg>,
		onClick: openDisplay
	});

	return (
		<>
			<PersonDetailShell
				backdropUrl={randomBackdrop}
				imageUrl={imageUrl}
				placeholderInitial={person.Name?.[0]}
				name={person.Name}
				metaLines={[...dateLines, birthPlace].filter(Boolean)}
				overview={showsSection('biography') ? person.Overview : null}
				actions={actions}
				tabs={tabs}
			/>
			{showDisplay && <PersonDisplayDialog onClose={closeDisplay} />}
		</>
	);
};

export default Person;
