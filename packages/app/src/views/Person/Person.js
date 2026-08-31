import {useState, useEffect, useCallback, useMemo} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Image from '@enact/sandstone/Image';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import MediaRow from '../../components/MediaRow';
import RatingsRow from '../../components/RatingsRow';
import LoadingSpinner from '../../components/LoadingSpinner';
import usePersonSeerrCredits from '../../hooks/usePersonSeerrCredits';
import {KEYS} from '../../utils/keys';
import {getImageUrl} from '../../utils/helpers';
import {isMdblistEnabled} from '../../services/mdblistApi';
import {personDateLines, splitFilmography} from '../../utils/personCredits';

import css from './Person.module.less';

const SpottableDiv = Spottable('div');

const TabsContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const Person = ({personId, onSelectItem, onSelectSeerrItem, onSelectSeerrPerson}) => {
	const {api, serverUrl} = useAuth();
	const {settings} = useSettings();
	const [person, setPerson] = useState(null);
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [overviewExpanded, setOverviewExpanded] = useState(false);
	const [activeTab, setActiveTab] = useState(0);
	const handleToggleOverview = useCallback(() => setOverviewExpanded(prev => !prev), []);

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
			setOverviewExpanded(false);
			setActiveTab(0);
			loadPerson();
		}
	}, [api, personId]);

	const tmdbId = person?.ProviderIds?.Tmdb;
	const {appearances, crewCredits, seerrEnabled} = usePersonSeerrCredits(tmdbId);

	const handleSelectItem = useCallback((item) => {
		onSelectItem?.(item);
	}, [onSelectItem]);

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

	const handleHeaderKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('navbar');
		}
	}, []);

	const {movies, series, guestAppearances, musicVideos} = splitFilmography(items);

	const tabs = useMemo(() => {
		const list = [];
		if (movies.length > 0) list.push({key: 'movies', label: $L('Movies'), items: movies, cardType: 'portrait', select: handleSelectItem});
		if (series.length > 0) list.push({key: 'series', label: $L('Series'), items: series, cardType: 'portrait', select: handleSelectItem});
		if (guestAppearances.length > 0) list.push({key: 'guest', label: $L('Guest Appearances'), items: guestAppearances, cardType: 'landscape', select: handleSelectItem});
		if (musicVideos.length > 0) list.push({key: 'music', label: $L('Music Videos'), items: musicVideos, cardType: 'portrait', select: handleSelectItem});
		if (crewCredits.length > 0) list.push({key: 'crew', label: $L('Crew Contributions (Seerr)'), items: crewCredits, cardType: 'portrait', select: handleSelectCredit});
		if (appearances.length > 0) list.push({key: 'seerr', label: $L('Appearances (Seerr)'), items: appearances, cardType: 'portrait', select: handleSelectCredit});
		return list;
	}, [movies, series, guestAppearances, musicVideos, crewCredits, appearances, handleSelectItem, handleSelectCredit]);

	const handleTabKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.LEFT) {
			e.preventDefault();
			setActiveTab((t) => Math.max(0, Math.min(t - 1, tabs.length - 1)));
		} else if (e.keyCode === KEYS.RIGHT) {
			e.preventDefault();
			setActiveTab((t) => Math.max(0, Math.min(t + 1, tabs.length - 1)));
		}
	}, [tabs.length]);

	const handleTabClick = useCallback((e) => {
		const idx = parseInt(e.currentTarget.dataset.tabIndex, 10);
		if (!isNaN(idx)) setActiveTab(idx);
	}, []);

	useEffect(() => {
		if (activeTab >= tabs.length && tabs.length > 0) {
			setActiveTab(0);
		}
	}, [tabs.length, activeTab]);

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
	const active = tabs[activeTab];

	return (
		<div className={css.page}>
			{randomBackdrop && (
				<div className={css.randomBackdrop} style={{backgroundImage: `url(${randomBackdrop})`}} />
			)}
			<div className={css.content}>
				<div className={css.personInfo}>
					{imageUrl ? (
						<Image className={css.personImage} src={imageUrl} sizing="fill" />
					) : (
						<div className={css.noImage}>{person.Name?.[0]}</div>
					)}
					<div className={css.personDetails}>
						<h1 className={css.name}>{person.Name}</h1>
						<div className={css.metaRow}>
							{dateLines.map((line) => (
								<span key={line} className={css.meta}>{line}</span>
							))}
							{birthPlace && <span className={css.meta}>{birthPlace}</span>}
						</div>
						<RatingsRow item={person} serverUrl={serverUrl} pluginEnabled={isMdblistEnabled(settings)} />
						{person.Overview && (
							<SpottableDiv
								className={`${css.overview} ${overviewExpanded ? css.overviewExpanded : ''}`}
								onClick={handleToggleOverview}
								onKeyDown={handleHeaderKeyDown}
								spotlightId="person-overview"
							>
								{person.Overview}
								<span className={css.overviewToggle}>{overviewExpanded ? $L('Show Less') : $L('Show More')}</span>
							</SpottableDiv>
						)}
						<div className={css.personActions}>
							<SpottableDiv className={css.favoriteBtn} onClick={handleToggleFavorite} onKeyDown={handleHeaderKeyDown} spotlightId="person-favorite-btn">
								<svg className={`${css.favoriteIcon} ${person.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
									<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
								</svg>
								<span>{person.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
							</SpottableDiv>
							{showSeerrButton && (
								<SpottableDiv className={css.favoriteBtn} onClick={handleOpenSeerr} onKeyDown={handleHeaderKeyDown} spotlightId="person-seerr-btn">
									<span>{$L('Seerr')}</span>
								</SpottableDiv>
							)}
						</div>
					</div>
				</div>

			{tabs.length > 0 && (
				<TabsContainer className={css.tabs}>
					{tabs.map((tab, i) => (
						<SpottableDiv
							key={tab.key}
							className={`${css.tab} ${i === activeTab ? css.tabActive : ''}`}
							onKeyDown={handleTabKeyDown}
							data-tab-index={i}
							onClick={handleTabClick}
							data-spotlight-id={`person-tab-${tab.key}`}
							>
							{tab.label}
						</SpottableDiv>
					))}
				</TabsContainer>
			)}

				{active && (
					<div className={css.filmography}>
						<MediaRow
							title={`${active.label} (${active.items.length})`}
							items={active.items}
							serverUrl={serverUrl}
							cardType={active.cardType}
							onSelectItem={active.select}
							rowId={`person-${active.key}`}
						/>
					</div>
				)}
			</div>
		</div>
	);
};

export default Person;
