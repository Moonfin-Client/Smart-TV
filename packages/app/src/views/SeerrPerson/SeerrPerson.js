import {useCallback, useEffect, useMemo, useState} from 'react';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import $L from '@enact/i18n/$L';
import seerrApi from '../../services/seerrApi';
import {useAuth} from '../../context/AuthContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import MediaRow from '../../components/MediaRow';
import PersonDetailShell from '../../components/PersonDetailShell';
import {personDateLines, prepareCredits} from '../../utils/personCredits';
import {normalizeMediaItem} from '../../utils/seerrHomeRows';

import css from './SeerrPerson.module.less';

const SpottableDiv = Spottable('div');

// Same shell Person (a library person) uses, and the same MediaRow cards for the
// credits, so a person reached from a title you don't own looks like one reached
// from a title you do. This one has no Jellyfin record to favorite and nowhere
// further to jump to, so it only supplies a backdrop, portrait, overview, and the
// Appearances/Crew tabs.
const SeerrPerson = ({personId, personName, onClose, onSelectItem, onBack}) => {
	const {serverUrl} = useAuth();
	const [details, setDetails] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [credits, setCredits] = useState(null);

	useEffect(() => {
		if (!personId) return;

		const loadDetails = async () => {
			setLoading(true);
			setError(null);
			try {
				const [data, creditData] = await Promise.all([
					seerrApi.getPerson(personId),
					seerrApi.getPersonCombinedCredits(personId).catch(() => null)
				]);
				setDetails(data);
				setCredits(creditData);
			} catch (err) {
				console.error('Failed to load person details:', err);
				setError(err.message || $L('Failed to load details'));
			} finally {
				setLoading(false);
			}
		};

		loadDetails();
	}, [personId]);

	useEffect(() => {
		if (!loading && details) {
			Spotlight.focus('person-tab-appearances');
		}
	}, [loading, details]);

	// Same idea as the native Person screen: pull a backdrop from whatever this person has
	// been in, rather than leaving the screen flat. TMDB credits carry their own backdrop
	// per title, so there is no need to go fetch one separately.
	const backdropCandidates = useMemo(() => {
		const rawCastForBackdrop = credits?.cast || details?.combinedCredits?.cast || details?.credits?.cast;
		const rawCrewForBackdrop = credits?.crew || details?.combinedCredits?.crew || details?.credits?.crew;
		const urls = [];
		for (const item of [...(rawCastForBackdrop || []), ...(rawCrewForBackdrop || [])]) {
			const backdropPath = item.backdropPath || item.backdrop_path;
			if (backdropPath) urls.push(seerrApi.getImageUrl(backdropPath, 'w1280'));
		}
		return urls;
	}, [credits, details]);

	const randomBackdrop = useMemo(() => {
		if (backdropCandidates.length === 0) return null;
		return backdropCandidates[Math.floor(Math.random() * backdropCandidates.length)];
	}, [backdropCandidates]);

	const handleSelectMedia = useCallback((item) => {
		if (item?._seerrRaw) onSelectItem?.(item._seerrRaw);
	}, [onSelectItem]);

	const rawCast = credits?.cast || details?.combinedCredits?.cast || details?.credits?.cast;
	const rawCrew = credits?.crew || details?.combinedCredits?.crew || details?.credits?.crew;
	const appearances = useMemo(() => prepareCredits(rawCast, {isCrew: false}).map(normalizeMediaItem), [rawCast]);
	const crewCredits = useMemo(() => prepareCredits(rawCrew, {isCrew: true}).map(normalizeMediaItem), [rawCrew]);

	const tabs = useMemo(() => {
		const list = [];
		if (appearances.length > 0) {
			list.push({key: 'appearances', label: $L('Appearances'), content: (
				<MediaRow title={`${$L('Appearances')} (${appearances.length})`} items={appearances} serverUrl={serverUrl} cardType="portrait" onSelectItem={handleSelectMedia} rowId="person-appearances" />
			)});
		}
		if (crewCredits.length > 0) {
			list.push({key: 'crew', label: $L('Crew'), content: (
				<MediaRow title={`${$L('Crew')} (${crewCredits.length})`} items={crewCredits} serverUrl={serverUrl} cardType="portrait" onSelectItem={handleSelectMedia} rowId="person-crew" />
			)});
		}
		return list;
	}, [appearances, crewCredits, handleSelectMedia, serverUrl]);

	if (loading) {
		return (
			<div className={css.page}>
				<LoadingSpinner />
			</div>
		);
	}

	if (error) {
		return (
			<div className={css.page}>
				<div className={css.error}>
					<p>{error}</p>
					<SpottableDiv className={css.errorButton} onClick={onClose || onBack}>
						{$L('Go Back')}
					</SpottableDiv>
				</div>
			</div>
		);
	}

	if (!details) {
		return (
			<div className={css.page}>
				<div className={css.error}>
					<p>{$L('No details available')}</p>
				</div>
			</div>
		);
	}

	const profileUrl = details.profilePath
		? seerrApi.getImageUrl(details.profilePath, 'h632')
		: null;
	const dateLines = personDateLines(details.birthday, details.deathday);
	const knownFor = details.knownForDepartment ? `${$L('Known for:')} ${details.knownForDepartment}` : null;

	return (
		<PersonDetailShell
			backdropUrl={randomBackdrop}
			imageUrl={profileUrl}
			placeholderInitial={details.name?.[0]}
			name={personName || details.name}
			metaLines={[...dateLines, details.placeOfBirth, knownFor].filter(Boolean)}
			overview={details.biography}
			tabs={tabs}
		/>
	);
};

export default SeerrPerson;
