import {useState, useEffect, useCallback, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import MediaRow from '../../components/MediaRow';
import LoadingSpinner from '../../components/LoadingSpinner';
import PersonDetailShell from '../../components/PersonDetailShell';
import usePersonSeerrCredits from '../../hooks/usePersonSeerrCredits';
import {getImageUrl} from '../../utils/helpers';
import {personDateLines, splitFilmography} from '../../utils/personCredits';

import css from './Person.module.less';

// Same shell as SeerrPerson (a TMDB-only person). This one has a Jellyfin
// person record and its own library filmography, so it adds a favorite
// button and a way to jump to the Seerr side. The backdrop, portrait,
// overview and tab bar all come from the shared PersonDetailShell.
const Person = ({personId, onSelectItem, onSelectSeerrItem, onSelectSeerrPerson}) => {
	const {api, serverUrl} = useAuth();
	const [person, setPerson] = useState(null);
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const loadPerson = async () => {
			try {
				const [personData, itemsData] = await Promise.all([
					api.getPerson(personId),
					api.getItemsByPerson(personId)
				]);
				setPerson(personData);
				setItems(itemsData.Items || []);
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

	const {movies, series, guestAppearances, musicVideos} = useMemo(() => splitFilmography(items), [items]);

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
		if (crewCredits.length > 0) {
			list.push({key: 'crew', label: $L('Crew Contributions (Seerr)'), content: (
				<MediaRow title={`${$L('Crew Contributions (Seerr)')} (${crewCredits.length})`} items={crewCredits} serverUrl={serverUrl} cardType="portrait" onSelectItem={handleSelectCredit} rowId="person-crew" />
			)});
		}
		if (appearances.length > 0) {
			list.push({key: 'seerr', label: $L('Appearances (Seerr)'), content: (
				<MediaRow title={`${$L('Appearances (Seerr)')} (${appearances.length})`} items={appearances} serverUrl={serverUrl} cardType="portrait" onSelectItem={handleSelectCredit} rowId="person-seerr" />
			)});
		}
		return list;
	}, [movies, series, guestAppearances, musicVideos, crewCredits, appearances, onSelectItem, handleSelectCredit, serverUrl]);

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
		? getImageUrl(serverUrl, person.Id, 'Primary', {maxHeight: 450, quality: 90})
		: null;
	const dateLines = personDateLines(person.PremiereDate, person.EndDate);
	const birthPlace = person.ProductionLocations?.[0];
	const showSeerrButton = Boolean(tmdbId && seerrEnabled && onSelectSeerrPerson);

	const favoriteIcon = (
		<svg className={`${css.favoriteIcon} ${person.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
			<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z" />
		</svg>
	);

	const actions = [
		{key: 'favorite', label: person.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite'), icon: favoriteIcon, onClick: handleToggleFavorite}
	];
	if (showSeerrButton) {
		actions.push({key: 'seerr', label: $L('Seerr'), icon: null, onClick: handleOpenSeerr});
	}

	return (
		<PersonDetailShell
			backdropUrl={randomBackdrop}
			imageUrl={imageUrl}
			placeholderInitial={person.Name?.[0]}
			name={person.Name}
			metaLines={[...dateLines, birthPlace].filter(Boolean)}
			overview={person.Overview}
			actions={actions}
			tabs={tabs}
		/>
	);
};

export default Person;
