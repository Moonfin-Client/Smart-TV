import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {useSettings} from '../../context/SettingsContext';
import {useStorage} from '../../hooks/useStorage';
import {isAudiobookLibrary} from '../../utils/bookLibrary';
import {keepFocusInView} from '../../utils/focusScroll';
import {stopPropagation} from '../../utils/gridChrome';
import {formatDuration} from '../../utils/helpers';
import {KEYS} from '../../utils/keys';
import {rem} from '../../utils/rootScale';
import {ModalContainer, PanelContainer} from '../../utils/spotlightContainers';
import {CoreIcon, focusSoon, indexFromId} from '../MusicBrowse/MusicScreenParts';
import {countLabel, gridRows} from '../MusicBrowse/musicScreens';
import {BookIcon} from './BookCard';
import {
	AUDIOBOOK_GENRES_KEY, AUDIOBOOK_GENRE_POOL, BOOK_SUBJECTS_KEY, BOOK_SUBJECT_POOL, DEFAULT_AUDIOBOOK_GENRES,
	DEFAULT_BOOK_SUBJECTS, loadDiscoverDetails, loadSubject, pickedSubjects, searchDiscover, subjectLabel
} from './bookDiscover';
import {
	EmptyNote, ScreenHeader, ShelfContainer, contentKeyHandler, focusRail, handleGridKey, rowEdgeKey, screenPx, useColumns,
	useScreenBack, useScreenFocus
} from './BookScreenParts';

import css from '../MusicBrowse/MusicScreens.module.less';
import chipsCss from '../MusicBrowse/MusicChips.module.less';
import filterCss from '../MusicBrowse/MusicFilterPanel.module.less';
import musicCss from '../MusicBrowse/MusicLibrary.module.less';
import cardCss from './BookCard.module.less';
import bookCss from './BookScreens.module.less';

const SpottableDiv = Spottable('div');
const handleContentKey = contentKeyHandler('discover');

const SEARCH_ID = 'book-discover-search';
const HERO_ID = 'book-discover-hero';
const RESULT_ID = 'book-discover-result';
const CLOSE_ID = 'book-discover-close';
const EDIT_ID = 'book-discover-edit';
const ALL = '';
const CARD_WIDTH = 170;
const SEARCH_DELAY = 500;
const TICKS_PER_SECOND = 10000000;

const sourceName = (book) => (book.source === 'librivox' ? 'LibriVox' : 'Open Library');

const Cover = ({book, className, style}) => (
	<div className={className} style={style}>
		{book.coverUrl ? <img className={cardCss.image} src={book.coverUrl} alt="" loading="lazy" /> : (
			<div className={cardCss.placeholder}><BookIcon name={book.source === 'librivox' ? 'headphones_rounded' : 'menu_book_rounded'} className={cardCss.placeholderIcon} /></div>
		)}
	</div>
);

// A free title, drawn like the library's own book cards. Audiobooks are square.
const DiscoverCard = memo(({book, width, spotlightId, onSelect}) => {
	const handleClick = useCallback(() => onSelect(book), [book, onSelect]);
	const square = book.source === 'librivox';
	const {settings} = useSettings();
	return (
		<SpottableDiv className={settings.cardFocusZoom ? cardCss.card : `${cardCss.card} ${cardCss.noZoom}`} style={{width}} spotlightId={spotlightId} onClick={handleClick}>
			<Cover book={book} className={cardCss.cover} style={{height: square ? width : width * 1.5}} />
			<div className={cardCss.title}>{book.title}</div>
			<div className={cardCss.subtitle}>{book.author || '\u00a0'}</div>
		</SpottableDiv>
	);
});

const metaOf = (book) => [book.author, book.year ? String(book.year) : ''].filter(Boolean).join(' · ');

// A title's details over the screen, with what the source says about it. Back or Close shuts it.
const DiscoverDetails = ({book, onClose}) => {
	const [loaded, setLoaded] = useState(null);
	const full = loaded || book;
	useEffect(() => {
		let cancelled = false;
		loadDiscoverDetails(book).then((res) => { if (!cancelled) setLoaded(res); });
		return () => { cancelled = true; };
	}, [book]);
	useEffect(() => focusSoon(CLOSE_ID), []);
	const audio = full.source === 'librivox';
	const facts = [
		full.sections ? countLabel(full.sections, $L('1 section'), $L('{count} sections')) : '',
		formatDuration(full.seconds * TICKS_PER_SECOND)
	].filter(Boolean).join(' · ');

	return (
		<div className={bookCss.detailOverlay} onClick={onClose}>
			<ModalContainer className={bookCss.detailPanel} spotlightId="book-discover-details" onClick={stopPropagation}>
				<Cover book={full} className={bookCss.heroCover} style={audio ? {height: rem(210)} : null} />
				<div className={bookCss.detailText}>
					<div className={css.eyebrow}>{sourceName(full)}</div>
					<div className={css.detailTitle}>{full.title}</div>
					<div className={css.meta}>{metaOf(full)}</div>
					{facts && <div className={css.subMeta}>{facts}</div>}
					<div className={bookCss.detailOverview}>{full.overview || (loaded ? $L('No description available.') : $L('Loading...'))}</div>
					{full.readers?.length > 0 && <div className={css.subMeta}>{$L('Read by {names}').replace('{names}', full.readers.slice(0, 4).join(', '))}</div>}
					{full.tags?.length > 0 && (
						<div className={bookCss.tags}>
							{full.tags.map((tag) => <span key={tag} className={bookCss.tag}>{tag}</span>)}
						</div>
					)}
					<div className={css.panelButtons}>
						<SpottableDiv className={musicCss.heroBtn} spotlightId={CLOSE_ID} onClick={onClose}>{$L('Close')}</SpottableDiv>
					</div>
				</div>
			</ModalContainer>
		</div>
	);
};

// Which subjects show, picked from the whole list. One always stays on.
const SubjectPicker = ({pool, picked, onToggle, onClose}) => {
	useEffect(() => focusSoon('book-subject-option-0'), []);
	const handleClick = useCallback((e) => onToggle(pool[parseInt(e.currentTarget.dataset.index, 10)]), [pool, onToggle]);
	return (
		<div className={filterCss.overlay} onClick={onClose}>
			<PanelContainer className={filterCss.panel} spotlightId="book-subject-picker" onClick={stopPropagation} onFocus={keepFocusInView}>
				<h2 className={filterCss.title}>{$L('Subjects')}</h2>
				{pool.map((subject, index) => {
					const on = picked.includes(subject);
					return (
						<SpottableDiv
							key={subject}
							className={on ? `${filterCss.option} ${filterCss.optionActive}` : filterCss.option}
							data-index={index}
							spotlightId={`book-subject-option-${index}`}
							onClick={handleClick}
						>
							<span className={filterCss.check}>{on && <span className={filterCss.checkMark} />}</span>
							<span className={filterCss.optionLabel}>{subjectLabel(subject)}</span>
						</SpottableDiv>
					);
				})}
			</PanelContainer>
		</div>
	);
};

// Free public domain titles: a search over the source, the subjects to browse, the first subject's
// top title as a hero, then a shelf per subject. Titles open their details over the screen.
const BookDiscoverScreen = ({library, onBack, backHandlerRef}) => {
	const audio = isAudiobookLibrary(library);
	const pool = audio ? AUDIOBOOK_GENRE_POOL : BOOK_SUBJECT_POOL;
	const [stored, setStored] = useStorage(audio ? AUDIOBOOK_GENRES_KEY : BOOK_SUBJECTS_KEY, null);
	const subjects = useMemo(() => pickedSubjects(stored, pool, audio ? DEFAULT_AUDIOBOOK_GENRES : DEFAULT_BOOK_SUBJECTS), [stored, pool, audio]);
	const [subject, setSubject] = useState(ALL);
	const [shelves, setShelves] = useState({});
	const [text, setText] = useState('');
	const [results, setResults] = useState(null);
	const [details, setDetails] = useState(null);
	const [picking, setPicking] = useState(false);
	const asked = useRef(new Set());
	const {columns, px} = useColumns(CARD_WIDTH + 40, 120, 30);
	const query = text.trim();

	useEffect(() => {
		subjects.forEach((name) => {
			if (asked.current.has(name)) return;
			asked.current.add(name);
			loadSubject(name, audio)
				.then((books) => setShelves((prev) => ({...prev, [name]: books})))
				.catch(() => setShelves((prev) => ({...prev, [name]: []})));
		});
	}, [subjects, audio]);

	// Typing waits for a pause before it searches, and a newer search wins over an older one.
	useEffect(() => {
		setResults(null);
		if (!query) return undefined;
		let cancelled = false;
		const timer = setTimeout(() => {
			searchDiscover(query, audio).then((books) => { if (!cancelled) setResults(books); }, () => { if (!cancelled) setResults([]); });
		}, SEARCH_DELAY);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [query, audio]);

	const closeDetails = useCallback(() => {
		const opener = details?.opener;
		setDetails(null);
		if (opener) focusSoon(opener);
		return true;
	}, [details]);
	const closePicker = useCallback(() => {
		setPicking(false);
		focusSoon(EDIT_ID);
		return true;
	}, []);

	useScreenBack(backHandlerRef, onBack, () => (details ? closeDetails() : picking ? closePicker() : false));
	const shown = subject === ALL ? subjects : subjects.filter((name) => name === subject);
	const ready = shown.some((name) => shelves[name]);
	useScreenFocus('discover', ready && !details && !picking);

	const openDetails = useCallback((book) => setDetails({book, opener: document.activeElement?.dataset?.spotlightId}), []);
	const handleText = useCallback((e) => setText(e.target.value), []);
	const handleSubject = useCallback((e) => setSubject(e.currentTarget.dataset.subject), []);
	const openPicker = useCallback(() => setPicking(true), []);
	const toggleSubject = useCallback((name) => {
		const next = subjects.includes(name) ? subjects.filter((s) => s !== name) : [...subjects, name];
		if (next.length) setStored(next);
		if (!next.includes(subject)) setSubject(ALL);
	}, [subjects, subject, setStored]);

	const featured = subject === ALL ? shelves[subjects[0]]?.[0] : null;
	const openFeatured = useCallback(() => featured && openDetails(featured), [featured, openDetails]);
	// The featured title's overview comes from its details, read once it's picked.
	const [featuredOverview, setFeaturedOverview] = useState(null);
	useEffect(() => {
		setFeaturedOverview(featured?.overview || null);
		if (!featured || featured.overview) return undefined;
		let cancelled = false;
		loadDiscoverDetails(featured).then((full) => { if (!cancelled) setFeaturedOverview(full.overview || null); });
		return () => { cancelled = true; };
	}, [featured]);

	const resultRows = useMemo(() => gridRows(results ? results.length : 0, columns), [results, columns]);
	const focusResult = useCallback((index) => Spotlight.focus(`${RESULT_ID}-${index}`), []);
	const handleResultsKey = useCallback((e) => handleGridKey(e, {rows: resultRows, index: indexFromId(e.target, RESULT_ID), focusIndex: focusResult}), [resultRows, focusResult]);
	const handleHeroKey = useCallback((e) => {
		if (e.keyCode !== KEYS.LEFT) return;
		e.preventDefault();
		e.stopPropagation();
		focusRail();
	}, []);

	const count = query ? (results?.length ? countLabel(results.length, $L('1 result'), $L('{count} results')) : null) : $L('Free public domain books');
	const empty = query ? results && results.length === 0 : shown.every((name) => shelves[name] && shelves[name].length === 0);

	return (
		<div className={css.screen}>
			<ScreenHeader
				screenId="discover"
				title={$L('Discover')}
				count={count}
				below={(
					<>
						<SpottableInput
							type="text"
							purpose="search"
							className={bookCss.search}
							placeholder={audio ? $L('Search LibriVox') : $L('Search Open Library')}
							value={text}
							onChange={handleText}
							spotlightId={SEARCH_ID}
						/>
						<div className={bookCss.subjects} onFocus={keepFocusInView} onKeyDown={rowEdgeKey}>
							{[ALL, ...subjects].map((name) => (
								<SpottableDiv
									key={name || 'all'}
									className={name === subject ? `${chipsCss.chip} ${css.chipCurrent}` : chipsCss.chip}
									data-subject={name}
									spotlightId={`book-discover-subject-${name || 'all'}`}
									onClick={handleSubject}
								>
									<span className={chipsCss.chipLabel}>{name ? subjectLabel(name) : $L('All Subjects')}</span>
								</SpottableDiv>
							))}
							<SpottableDiv className={chipsCss.chip} spotlightId={EDIT_ID} onClick={openPicker} aria-label={$L('Edit')}>
								<CoreIcon name="edit" />
							</SpottableDiv>
						</div>
					</>
				)}
			/>

			<div className={css.scroller} onKeyDown={handleContentKey} onFocus={keepFocusInView}>
				{empty ? <EmptyNote /> : null}
				{!empty && query && results && (
					<div className={bookCss.grid} onKeyDown={handleResultsKey}>
						{resultRows.map((row) => (
							<div key={row.start} className={bookCss.bookRow}>
								{results.slice(row.start, row.end).map((book, i) => (
									<DiscoverCard key={book.id} book={book} width={px} spotlightId={`${RESULT_ID}-${row.start + i}`} onSelect={openDetails} />
								))}
							</div>
						))}
					</div>
				)}
				{query && !results && <div className={css.loading}>{$L('Loading...')}</div>}
				{!query && !empty && (
					<>
						{featured && (
							<div className={bookCss.hero}>
								<Cover book={featured} className={bookCss.heroCover} style={audio ? {height: rem(210)} : null} />
								<div className={bookCss.panelInfo}>
									<div className={css.eyebrow}>{`${$L('Featured')} · ${sourceName(featured)}`}</div>
									<div className={css.detailTitle}>{featured.title}</div>
									<div className={css.meta}>{metaOf(featured)}</div>
									{featuredOverview && <div className={bookCss.overviewText}>{featuredOverview}</div>}
									<div className={css.panelButtons} onKeyDown={handleHeroKey}>
										<SpottableDiv className={`${musicCss.heroBtn} ${musicCss.primaryBtn}`} spotlightId={HERO_ID} onClick={openFeatured}>
											<CoreIcon name="info_outline" />{$L('Details')}
										</SpottableDiv>
									</div>
								</div>
							</div>
						)}
						{shown.map((name, s) => (
							<div key={name} className={bookCss.discoverSection}>
								<h2 className={bookCss.sectionTitle}>{subjectLabel(name)}</h2>
								{shelves[name] ? (
									<ShelfContainer className={bookCss.shelf} onKeyDown={rowEdgeKey} onFocus={keepFocusInView}>
										{shelves[name].map((book, i) => (
											<DiscoverCard key={book.id} book={book} width={screenPx(CARD_WIDTH)} spotlightId={`book-discover-${s}-${i}`} onSelect={openDetails} />
										))}
									</ShelfContainer>
								) : <div className={css.loading}>{$L('Loading...')}</div>}
							</div>
						))}
					</>
				)}
			</div>

			{details && <DiscoverDetails book={details.book} onClose={closeDetails} />}
			{picking && <SubjectPicker pool={pool} picked={subjects} onToggle={toggleSubject} onClose={closePicker} />}
		</div>
	);
};

export default BookDiscoverScreen;
