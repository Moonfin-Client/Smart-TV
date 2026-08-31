import {useCallback, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import MediaRow from '../../components/MediaRow';
import RatingsRow from '../../components/RatingsRow';
import usePersonSeerrCredits from '../../hooks/usePersonSeerrCredits';
import {getImageUrl} from '../../utils/helpers';
import {isMdblistEnabled} from '../../services/mdblistApi';
import {KEYS} from '../../utils/keys';

import css from './Details.module.less';

const SpottableDiv = Spottable('div');

const TabsContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

const PersonScreen = ({item, serverUrl, settings, filmography, personDates, birthPlace, onSelectItem, onSelectSeerrItem}) => {
	const {appearances, crewCredits} = usePersonSeerrCredits(item.ProviderIds?.Tmdb);
	const {movies, series, guestAppearances, musicVideos} = filmography || {movies: [], series: [], guestAppearances: [], musicVideos: []};

	const handleSeerrSelect = useCallback((c) => {
		if (c?._seerrRaw) onSelectSeerrItem?.(c._seerrRaw);
	}, [onSelectSeerrItem]);

	const tabs = useMemo(() => {
		const list = [];
		if (movies.length > 0) list.push({key: 'movies', label: $L('Movies'), items: movies, cardType: 'portrait', select: onSelectItem});
		if (series.length > 0) list.push({key: 'series', label: $L('Series'), items: series, cardType: 'portrait', select: onSelectItem});
		if (guestAppearances.length > 0) list.push({key: 'guest', label: $L('Guest Appearances'), items: guestAppearances, cardType: 'landscape', select: onSelectItem});
		if (musicVideos.length > 0) list.push({key: 'music', label: $L('Music Videos'), items: musicVideos, cardType: 'portrait', select: onSelectItem});
		if (crewCredits.length > 0) list.push({key: 'crew', label: $L('Crew Contributions (Seerr)'), items: crewCredits, cardType: 'portrait', select: handleSeerrSelect});
		if (appearances.length > 0) list.push({key: 'seerr', label: $L('Appearances (Seerr)'), items: appearances, cardType: 'portrait', select: handleSeerrSelect});
		return list;
	}, [movies, series, guestAppearances, musicVideos, crewCredits, appearances, onSelectItem, handleSeerrSelect]);

	const [activeTab, setActiveTab] = useState(0);
	const [expanded, setExpanded] = useState(false);

	const handleTabKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.LEFT) {
			e.preventDefault();
			setActiveTab((t) => Math.max(0, Math.min(t - 1, tabs.length - 1)));
		} else if (e.keyCode === KEYS.RIGHT) {
			e.preventDefault();
			setActiveTab((t) => Math.max(0, Math.min(t + 1, tabs.length - 1)));
		}
	}, [tabs.length]);

	const handleOverviewKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER || e.keyCode === KEYS.SPACE) {
			e.preventDefault();
			setExpanded((v) => !v);
		}
	}, []);

	const handleTabClick = useCallback((e) => {
		const idx = parseInt(e.currentTarget.dataset.tabIndex, 10);
		if (!isNaN(idx)) setActiveTab(idx);
	}, []);

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

	const active = tabs[activeTab];

	return (
		<>
			{randomBackdrop && (
				<div className={css.personRandomBackdrop} style={{backgroundImage: `url(${randomBackdrop})`}} />
			)}
			<div className={css.personHeader}>
				<div className={css.personPhotoWrapper}>
					{item.ImageTags?.Primary ? (
						<img
							src={getImageUrl(serverUrl, item.Id, 'Primary', {maxHeight: 450, quality: 90})}
							className={css.personPhoto}
							alt=""
						/>
					) : (
						<div className={css.personPhotoPlaceholder}>
							<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"/></svg>
						</div>
					)}
				</div>
				<div className={css.personInfo}>
					<h1 className={css.title}>{item.Name}</h1>
					<div className={css.infoRow}>
						{personDates?.map((line) => (
							<span key={line} className={css.infoItem}>{line}</span>
						))}
						{birthPlace && <span className={css.infoItem}>{birthPlace}</span>}
					</div>
					<RatingsRow item={item} serverUrl={serverUrl} pluginEnabled={isMdblistEnabled(settings)} />
					{item.Overview && (
						<SpottableDiv
							className={css.overviewToggle}
							onKeyDown={handleOverviewKeyDown}
							data-spotlight-id="person-overview"
						>
							<p className={`${css.overview} ${expanded ? css.overviewExpanded : ''}`}>{item.Overview}</p>
							<span className={css.overviewToggleHint}>{expanded ? $L('Less') : $L('More')}</span>
						</SpottableDiv>
					)}
				</div>
			</div>

			{tabs.length > 0 && (
				<TabsContainer className={css.personTabs}>
					{tabs.map((tab, i) => (
						<SpottableDiv
							key={tab.key}
							className={`${css.personTab} ${i === activeTab ? css.personTabActive : ''}`}
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
				<div className={css.sectionsContainer}>
					<MediaRow
						title={`${active.label} (${active.items.length})`}
						items={active.items}
						serverUrl={serverUrl}
						cardType={active.cardType}
						onSelectItem={active.select}
						className={css.inlineRow}
					/>
				</div>
			)}
		</>
	);
};

export default PersonScreen;
