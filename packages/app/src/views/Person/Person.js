import {useState, useEffect, useCallback, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Image from '@enact/sandstone/Image';
import {useAuth} from '../../context/AuthContext';
import MediaCard from '../../components/MediaCard';
import {KEYS} from '../../utils/keys';
import LoadingSpinner from '../../components/LoadingSpinner';

import css from './Person.module.less';

const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const SpottableDiv = Spottable('div');

const Person = ({personId, onSelectItem}) => {
	const {api, serverUrl} = useAuth();
	const [person, setPerson] = useState(null);
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [overviewExpanded, setOverviewExpanded] = useState(false);
	const handleToggleOverview = useCallback(() => setOverviewExpanded(prev => !prev), []);
	const gridRef = useRef(null);

	useEffect(() => {
		const loadPerson = async () => {
			try {
				const [personData, itemsData] = await Promise.all([
					api.getPerson(personId),
					api.getItemsByPerson(personId, 50)
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
			loadPerson();
		}
	}, [api, personId]);

	const handleSelectItem = useCallback((item) => {
		onSelectItem?.(item);
	}, [onSelectItem]);

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

	const handleGridKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP) {
			const focused = document.activeElement;
			const grid = gridRef.current;
			if (focused && grid) {
				const firstCard = grid.firstElementChild;
				if (firstCard) {
					let card = focused;
					while (card && card.parentElement !== grid) card = card.parentElement;
					if (card && Math.abs(card.offsetTop - firstCard.offsetTop) < 10) {
						e.preventDefault();
						e.stopPropagation();
						Spotlight.focus('person-favorite-btn') || Spotlight.focus('person-overview') || Spotlight.focus('navbar'); // eslint-disable-line @babel/no-unused-expressions
					}
				}
			}
		}
	}, []);

	const handleGridFocus = useCallback((e) => {
		const container = e.currentTarget;
		const focused = e.target;
		if (container && focused && container !== focused) {
			const containerRect = container.getBoundingClientRect();
			const focusedRect = focused.getBoundingClientRect();
			if (focusedRect.bottom > containerRect.bottom) {
				container.scrollTop += focusedRect.bottom - containerRect.bottom + 20;
			} else if (focusedRect.top < containerRect.top) {
				container.scrollTop -= containerRect.top - focusedRect.top + 20;
			}
		}
	}, []);

	const handleFavoriteKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('person-overview') || Spotlight.focus('navbar'); // eslint-disable-line @babel/no-unused-expressions
		} else if (e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('person-grid');
		}
	}, []);

	const handleOverviewKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('navbar');
		} else if (e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('person-favorite-btn');
		}
	}, []);

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
		? `${serverUrl}/Items/${person.Id}/Images/Primary?maxHeight=400&quality=90`
		: null;

	return (
		<div className={css.page}>
			<div className={css.content}>
				<div className={css.personInfo}>
					{imageUrl ? (
						<Image className={css.personImage} src={imageUrl} sizing="fill" />
					) : (
						<div className={css.noImage}>{person.Name?.[0]}</div>
					)}
					<div className={css.personDetails}>
						<h1 className={css.name}>{person.Name}</h1>
						{person.PremiereDate && (
							<div className={css.meta}>
								{$L('Born')}: {new Date(person.PremiereDate).toLocaleDateString()}
							</div>
						)}
						{person.Overview && (
							<SpottableDiv
								className={`${css.overview} ${overviewExpanded ? css.overviewExpanded : ''}`}
								onClick={handleToggleOverview}
								onKeyDown={handleOverviewKeyDown}
								spotlightId="person-overview"
							>
								{person.Overview}
								<span className={css.overviewToggle}>{overviewExpanded ? $L('Show Less') : $L('Show More')}</span>
							</SpottableDiv>
						)}
						<SpottableDiv className={css.favoriteBtn} onClick={handleToggleFavorite} onKeyDown={handleFavoriteKeyDown} spotlightId="person-favorite-btn">
							<svg className={`${css.favoriteIcon} ${person.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
								<path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
							</svg>
							<span>{person.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
						</SpottableDiv>
					</div>
				</div>

				{items.length > 0 && (
					<div className={css.filmography}>
						<h2 className={css.sectionTitle}>{$L('Filmography')} ({items.length})</h2>
						<GridContainer className={css.gridContainer} spotlightId="person-grid" onKeyDown={handleGridKeyDown} onFocus={handleGridFocus}>
							<div className={css.grid} ref={gridRef}>
								{items.map(item => (
									<MediaCard
										key={item.Id}
										item={item}
										serverUrl={serverUrl}
										onSelect={handleSelectItem}
									/>
								))}
							</div>
						</GridContainer>
					</div>
				)}
			</div>
		</div>
	);
};

export default Person;
