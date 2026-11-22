import {memo, useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import {bookImageUrl, combinedTypes} from '../../utils/bookLibrary';
import {keepFocusInView} from '../../utils/focusScroll';
import {cleanOverview} from '../../utils/overviewText';
import {rem} from '../../utils/rootScale';
import {countLabel, gridRows} from '../MusicBrowse/musicScreens';
import {indexFromId} from '../MusicBrowse/MusicScreenParts';
import {titlesCount} from './bookScreens';
import {EmptyNote, ScreenHeader, contentKeyHandler, handleGridKey, useScreenBack, useScreenFocus} from './BookScreenParts';
import {loadBookCollections} from './useBookLibrary';

import css from '../MusicBrowse/MusicScreens.module.less';
import bookCss from './BookScreens.module.less';

const SpottableDiv = Spottable('div');
const handleContentKey = contentKeyHandler('collections');
const ID = 'book-collection';
const COLUMNS = 2;
const STRIP = 5;
const ALL_COLLECTIONS = 500;

const CollectionCard = memo(({item, index, serverUrl, onSelect}) => {
	const handleClick = useCallback(() => onSelect(item), [item, onSelect]);
	const covers = item.Covers || [];
	return (
		<SpottableDiv className={bookCss.collectionCard} style={{width: `calc(${100 / COLUMNS}% - ${rem(30)})`}} spotlightId={`${ID}-${index}`} onClick={handleClick}>
			<div className={bookCss.coverStrip}>
				{Array.from({length: STRIP}, (_, i) => {
					const url = covers[i] ? bookImageUrl(covers[i]._serverUrl || serverUrl, covers[i]) : null;
					return <div key={i} className={bookCss.stripCover}>{url && <img src={url} alt="" loading="lazy" />}</div>;
				})}
			</div>
			<div className={bookCss.cardName}>{item.Name}</div>
			<div className={css.subMeta}>{titlesCount(item.ChildCount) || '\u00a0'}</div>
			<div className={css.meta}>{cleanOverview(item.Overview) || '\u00a0'}</div>
		</SpottableDiv>
	);
});

// The collections that hold books, as wide cards with a strip of their covers.
const BookCollectionsScreen = ({library, data, api, serverUrl, onSelectItem, onBack, backHandlerRef}) => {
	// The library only checked its first few, so the rest are read here when there were more.
	const [all, setAll] = useState(data.collectionsIsFloor ? null : data.collections);
	const items = all || data.collections;

	useEffect(() => {
		if (all) return undefined;
		let cancelled = false;
		loadBookCollections(api, library.Id, combinedTypes(library), ALL_COLLECTIONS)
			.then((result) => { if (!cancelled) setAll(result.items); })
			.catch(() => { if (!cancelled) setAll(data.collections); });
		return () => { cancelled = true; };
	}, [all, api, library, data.collections]);

	useScreenBack(backHandlerRef, onBack);
	useScreenFocus('collections', true);

	const rows = useMemo(() => gridRows(items.length, COLUMNS), [items.length]);
	const focusIndex = useCallback((index) => Spotlight.focus(`${ID}-${index}`), []);
	const handleKeyDown = useCallback((e) => handleGridKey(e, {rows, index: indexFromId(e.target, ID), focusIndex}), [rows, focusIndex]);

	return (
		<div className={css.screen}>
			<ScreenHeader screenId="collections" title={$L('Collections')} count={items.length ? countLabel(items.length, $L('1 collection'), $L('{count} collections')) : null} />
			<div className={css.scroller} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
				{items.length === 0 ? <EmptyNote /> : (
					<div className={bookCss.collectionGrid} onKeyDown={handleKeyDown}>
						{items.map((item, index) => (
							<CollectionCard key={item.Id} item={item} index={index} serverUrl={serverUrl} onSelect={onSelectItem} />
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default BookCollectionsScreen;
