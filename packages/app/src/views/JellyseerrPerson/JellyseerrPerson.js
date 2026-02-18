import {useCallback, useEffect, useState, useRef} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import Image from '@enact/sandstone/Image';
import jellyseerrApi from '../../services/jellyseerrApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import css from './JellyseerrPerson.module.less';

const SpottableDiv = Spottable('div');

const JellyseerrPerson = ({personId, personName, onClose, onSelectItem, onBack}) => {
	const [details, setDetails] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [biographyExpanded, setBiographyExpanded] = useState(false);
	const appearancesRef = useRef([]);

	useEffect(() => {
		if (!personId) return;

		const loadDetails = async () => {
			setLoading(true);
			setError(null);
			try {
				const data = await jellyseerrApi.getPerson(personId);
				setDetails(data);
			} catch (err) {
				console.error('Failed to load person details:', err);
				setError(err.message || 'Failed to load details');
			} finally {
				setLoading(false);
			}
		};

		loadDetails();
	}, [personId]);

	useEffect(() => {
		if (!loading && details) {
			Spotlight.focus('person-appearances');
		}
	}, [loading, details]);

	const handleSelectMedia = useCallback((ev) => {
		const index = ev.currentTarget?.dataset?.index;
		if (index === undefined) return;
		const item = appearancesRef.current[parseInt(index, 10)];
		if (!item) return;
		const type = item.mediaType || item.media_type || (item.title ? 'movie' : 'tv');
		onSelectItem?.({
			mediaId: item.id,
			mediaType: type
		});
	}, [onSelectItem]);

	const toggleBiography = useCallback(() => {
		setBiographyExpanded(prev => !prev);
	}, []);

	const renderAppearanceCard = useCallback((item, index) => {
		const posterUrl = jellyseerrApi.getImageUrl(item.posterPath || item.poster_path, 'w342');
		const title = item.title || item.name;
		const character = item.character;
		const year = (item.releaseDate || item.release_date || item.firstAirDate || item.first_air_date)?.substring(0, 4);
		const itemMediaType = item.mediaType || item.media_type || (item.title ? 'movie' : 'tv');
		const status = item.mediaInfo?.status;

		return (
			<SpottableDiv
				key={`${item.id}-${item.mediaType || item.media_type}`}
				className={css.appearanceCard}
				onClick={handleSelectMedia}
				data-index={index}
			>
				<div className={css.posterContainer}>
					{posterUrl ? (
						<Image className={css.poster} src={posterUrl} sizing="fill" />
					) : (
						<div className={css.noPoster}>{title?.[0]}</div>
					)}
					{/* Media type badge - top left */}
					{itemMediaType && (
						<div className={`${css.mediaTypeBadge} ${itemMediaType === 'movie' ? css.movieBadge : css.seriesBadge}`}>
							{itemMediaType === 'movie' ? 'MOVIE' : 'SERIES'}
						</div>
					)}
					{/* Availability badge - top right */}
					{status && [3, 4, 5].includes(status) && (
						<div className={`${css.availabilityBadge} ${css[`availability${status}`]}`} />
					)}
				</div>
				<div className={css.cardInfo}>
					<p className={css.cardTitle}>{title}</p>
					{character && <p className={css.cardCharacter}>{character}</p>}
					{year && <p className={css.cardYear}>{year}</p>}
				</div>
			</SpottableDiv>
		);
	}, [handleSelectMedia]);

	if (loading) {
		return (
			<div className={css.container}>
				<LoadingSpinner />
			</div>
		);
	}

	if (error) {
		return (
			<div className={css.container}>
				<div className={css.error}>
					<p>{error}</p>
					<SpottableDiv className={css.errorButton} onClick={onClose || onBack}>
						Go Back
					</SpottableDiv>
				</div>
			</div>
		);
	}

	if (!details) {
		return (
			<div className={css.container}>
				<div className={css.error}>
					<p>No details available</p>
				</div>
			</div>
		);
	}

	const profileUrl = details.profilePath
		? jellyseerrApi.getImageUrl(details.profilePath, 'h632')
		: null;
	const birthYear = details.birthday ? new Date(details.birthday).getFullYear() : null;
	const deathYear = details.deathday ? new Date(details.deathday).getFullYear() : null;
	const biography = details.biography || '';
	const knownFor = details.knownForDepartment || '';

	const cast = details.combinedCredits?.cast || details.credits?.cast || [];
	const crew = details.combinedCredits?.crew || details.credits?.crew || [];
	const appearances = [
		...cast,
		...crew
	]
		.filter((item, index, self) =>
			index === self.findIndex(t => t.id === item.id && (t.mediaType || t.media_type) === (item.mediaType || item.media_type))
		)
		.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
		.slice(0, 50);

	appearancesRef.current = appearances;

	return (
		<div className={css.container}>
			<div className={css.mainContent}>
				{/* Header Section */}
				<div className={css.headerSection}>
					<div className={css.profileContainer}>
						{profileUrl ? (
							<Image className={css.profileImage} src={profileUrl} sizing="fill" />
						) : (
							<div className={css.profilePlaceholder}>{details.name?.[0]}</div>
						)}
					</div>

					<div className={css.infoContainer}>
						<h1 className={css.personName}>{personName || details.name}</h1>

						<div className={css.metaInfo}>
							{birthYear && (
								<span className={css.birthInfo}>
									{deathYear ? `${birthYear} - ${deathYear}` : `Born ${birthYear}`}
								</span>
							)}
							{details.placeOfBirth && (
								<span className={css.placeOfBirth}>{details.placeOfBirth}</span>
							)}
							{knownFor && (
								<span className={css.knownFor}>Known for: {knownFor}</span>
							)}
						</div>
					</div>
				</div>

				{/* Biography Section */}
				{biography && (
					<div className={css.biographySection}>
						<h2 className={css.sectionTitle}>Biography</h2>
						<p className={`${css.biographyText} ${biographyExpanded ? css.expanded : ''}`}>
							{biography}
						</p>
						{biography.length > 500 && (
							<SpottableDiv className={css.biographyToggle} onClick={toggleBiography}>
								{biographyExpanded ? 'Show Less' : 'Show More'}
							</SpottableDiv>
						)}
					</div>
				)}

				{/* Appearances Section */}
				{appearances.length > 0 && (
					<div className={css.appearancesSection}>
						<h2 className={css.sectionTitle}>Appearances ({appearances.length})</h2>
						<div className={css.appearancesList} data-spotlight-id="person-appearances">
							{appearances.map((item, index) => renderAppearanceCard(item, index))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default JellyseerrPerson;
