import {useState, useCallback, useEffect} from 'react';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Image from '@enact/sandstone/Image';
import $L from '@enact/i18n/$L';
import {KEYS} from '../../utils/keys';

import css from './PersonDetailShell.module.less';

const SpottableDiv = Spottable('div');
const TabsContainer = SpotlightContainerDecorator({enterTo: 'last-focused'}, 'div');

// Person (library people) and SeerrPerson (TMDB-only people) both render through this shell.
// Each brings its own data and its own tabs, but the header, the overview, the tab bar, and
// the MediaRow cards below are one piece of UI, not two that happen to look similar.
//
// Each tab is {key, label, content}, where content is whatever the caller wants drawn for it.
// Each action is {key, label, icon, onClick} for the optional row under the overview.
const PersonDetailShell = ({
	backdropUrl,
	imageUrl,
	placeholderInitial,
	name,
	metaLines = [],
	overview,
	actions = [],
	tabs = []
}) => {
	const [overviewExpanded, setOverviewExpanded] = useState(false);
	const [activeTab, setActiveTab] = useState(0);

	useEffect(() => {
		if (activeTab >= tabs.length && tabs.length > 0) setActiveTab(0);
	}, [tabs.length, activeTab]);

	const handleToggleOverview = useCallback(() => setOverviewExpanded((prev) => !prev), []);

	const handleHeaderKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('navbar');
		}
	}, []);

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

	const active = tabs[activeTab];

	return (
		<div className={css.page}>
			{backdropUrl && (
				<div className={css.randomBackdrop} style={{backgroundImage: `url(${backdropUrl})`}} />
			)}
			<div className={css.content}>
				<div className={css.personInfo}>
					{imageUrl ? (
						<Image className={css.personImage} src={imageUrl} sizing="fill" />
					) : (
						<div className={css.noImage}>{placeholderInitial}</div>
					)}
					<div className={css.personDetails}>
						<h1 className={css.name}>{name}</h1>
						{metaLines.length > 0 && (
							<div className={css.metaRow}>
								{metaLines.map((line) => (
									<span key={line} className={css.meta}>{line}</span>
								))}
							</div>
						)}
						{overview && (
							<SpottableDiv
								className={`${css.overview} ${overviewExpanded ? css.overviewExpanded : ''}`}
								onClick={handleToggleOverview}
								onKeyDown={handleHeaderKeyDown}
								spotlightId="person-overview"
							>
								{overview}
								<span className={css.overviewToggle}>{overviewExpanded ? $L('Show Less') : $L('Show More')}</span>
							</SpottableDiv>
						)}
						{actions.length > 0 && (
							<div className={css.personActions}>
								{actions.map((action) => (
									<SpottableDiv
										key={action.key}
										className={css.favoriteBtn}
										onClick={action.onClick}
										onKeyDown={handleHeaderKeyDown}
										spotlightId={`person-action-${action.key}`}
									>
										{action.icon}
										<span>{action.label}</span>
									</SpottableDiv>
								))}
							</div>
						)}
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
						{active.content}
					</div>
				)}
			</div>
		</div>
	);
};

export default PersonDetailShell;
