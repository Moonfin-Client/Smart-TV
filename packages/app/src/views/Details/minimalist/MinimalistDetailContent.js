import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';
import {isKidsMode} from '../../../utils/kidsMode';

import {IncompleteDetailLine} from '../../../components/IncompleteBadge';
import ModernActionButtons, {COLLECTION_ITEMS_BUTTON_ID, EXTRAS_BUTTON_ID} from '../ModernActionButtons';
import SpotlightDetailContent from '../spotlight/SpotlightDetailContent';
import SpotlightSectionModal from '../spotlight/SpotlightSectionModal';
import {collectionGroups, collectionLabel} from '../stage/stageRules';
import MinimalistEpisodes, {EPISODES_ID} from './MinimalistEpisodes';
import {
	drawsMinimalist, minimalistBranding, minimalistCollectionCard, minimalistExtrasCard, minimalistScrimAlpha,
	minimalistStillUrl, showsEpisodes, showsExtrasButton
} from './minimalistRules';

import css from './MinimalistDetailContent.module.less';

// The smallest detail screen: artwork, the title, one row of buttons and the episodes. No cast, no
// chapters, no collection rows, no recommendations. Extras and a collection's own titles each sit
// behind a button.
//
// Kids Mode always shows this one. Outside Kids Mode it is an ordinary style, for anyone who wants
// the screen to get out of the way.

// The widest the still is ever drawn, which is the cap the stylesheet puts on it.
const STILL_WIDTH = 440;

// Kids Mode offers Play and two others, plus the titles button on a collection, and those always
// fit, so there's nothing for an overflow menu to hold. Everywhere else the row is the usual five
// with the rest behind More.
const KIDS_VISIBLE = 4;
const VISIBLE = 5;

const MinimalistDetailContent = (props) => {
	const {
		item, settings, effectiveServerUrl, backdropUrl, logoUrl, onLogoError,
		seasons, episodes, seriesEpisodes, extras = [], collectionItems, loadMoreCollectionTitles, onSelectItem, handleEpisodePlay, spotlightBackRef
	} = props;

	const draws = drawsMinimalist(item.Type);
	const menuBackRef = useRef(null);
	const [sheet, setSheet] = useState(null);

	const openExtras = useCallback(() => setSheet('extras'), []);
	const openCollection = useCallback(() => setSheet('collection'), []);
	const closeSheet = useCallback(() => {
		setSheet(null);
		setTimeout(() => Spotlight.focus(sheet === 'collection' ? COLLECTION_ITEMS_BUTTON_ID : EXTRAS_BUTTON_ID), 50);
	}, [sheet]);

	// Picking an extra plays it rather than opening its own page, and a collection's title opens.
	const sheetActions = useMemo(() => ({
		openItem: (entry) => {
			closeSheet();
			if (sheet === 'collection') onSelectItem?.(entry);
			else handleEpisodePlay?.(entry);
		}
	}), [sheet, closeSheet, onSelectItem, handleEpisodePlay]);

	const groups = useMemo(() => collectionGroups(item, collectionItems), [item, collectionItems]);
	const sheetCard = useMemo(() => {
		if (sheet === 'extras') return minimalistExtrasCard(extras);
		if (sheet === 'collection') return minimalistCollectionCard(item, groups);
		return null;
	}, [sheet, extras, item, groups]);

	// App closes the screen on BACK unless something here says it took the press, so the open menu
	// and then the open sheet get their say first. Left alone when Spotlight is drawing instead, since
	// it has its own back handler and more than one thing to close with it.
	useEffect(() => {
		if (!spotlightBackRef || !draws) return undefined;
		spotlightBackRef.current = () => {
			if (menuBackRef.current?.()) return true;
			if (!sheet) return false;
			closeSheet();
			return true;
		};
		return () => {
			spotlightBackRef.current = null;
		};
	});

	if (!draws) return <SpotlightDetailContent {...props} />;

	const kidsMode = isKidsMode(settings);
	const hasEpisodes = showsEpisodes(item.Type);
	const {title, episodeName} = minimalistBranding(item);
	const stillUrl = minimalistStillUrl(effectiveServerUrl, item, {settings, width: STILL_WIDTH});
	const scrimStyle = {backgroundColor: `rgba(0, 0, 0, ${minimalistScrimAlpha(settings.backdropBlurDetail)})`};

	return (
		<>
			<div className={css.backdrop}>
				{settings.detailsBackdropEnabled !== false && backdropUrl && <img className={css.backdropImage} src={backdropUrl} alt="" />}
				<div className={css.scrim} style={scrimStyle} />
			</div>
			<div className={`${css.content} ${settings.navbarPosition === 'left' ? css.sidebarOffset : ''}`}>
				<div className={css.upper}>
					<div className={css.headline}>
						{logoUrl
							? <img className={css.logo} src={logoUrl} onError={onLogoError} alt="" />
							: <h1 className={css.title}>{title}</h1>}
						{episodeName && <div className={css.episodeName}>{episodeName}</div>}
						<IncompleteDetailLine itemId={item.Id} clockDisplay={settings.clockDisplay} />
						<div className={css.actions}>
							<ModernActionButtons
								{...props}
								maxVisibleButtons={kidsMode ? KIDS_VISIBLE : VISIBLE}
								overflowAsMenu={!kidsMode}
								downTarget={hasEpisodes ? EPISODES_ID : null}
								menuBackRef={menuBackRef}
								handleOpenExtras={showsExtrasButton(item.Type, extras, kidsMode) ? openExtras : null}
								handleOpenCollectionItems={groups.length ? openCollection : null}
								collectionItemsLabel={collectionLabel(groups)}
							/>
						</div>
					</div>
					{stillUrl && (
						<div className={css.aside}>
							<img className={css.still} src={stillUrl} alt="" />
						</div>
					)}
				</div>
				{hasEpisodes && (
					<MinimalistEpisodes
						item={item}
						settings={settings}
						serverUrl={effectiveServerUrl}
						seasons={seasons}
						episodes={episodes}
						seriesEpisodes={seriesEpisodes}
						onSelectEpisode={onSelectItem}
					/>
				)}
			</div>
			<SpotlightSectionModal
				card={sheetCard}
				serverUrl={effectiveServerUrl}
				actions={sheetActions}
				onNearEnd={sheet === 'collection' ? loadMoreCollectionTitles : null}
			/>
		</>
	);
};

export default MinimalistDetailContent;
