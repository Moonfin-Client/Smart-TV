import {useState, useEffect, useCallback} from 'react';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {VirtualGridList} from '@enact/sandstone/VirtualList';
import Image from '@enact/sandstone/Image';
import {useAuth} from '../../context/AuthContext';
import MediaCard from '../../components/MediaCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import {isBackKey, TIZEN_KEYS} from '../../utils/tizenKeys';

import css from './Person.module.less';

const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

const Person = ({personId, onSelectItem, onBack}) => {
	const {api, serverUrl} = useAuth();
	const [person, setPerson] = useState(null);
	const [items, setItems] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (isBackKey(e)) {
				onBack?.();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [onBack]);

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
			loadPerson();
		}
	}, [api, personId]);

	const handleSelectItem = useCallback((item) => {
		onSelectItem?.(item);
	}, [onSelectItem]);

	const handleGridKeyDown = useCallback((e) => {
		 if (e.keyCode === TIZEN_KEYS.UP) {
			const grid = document.querySelector(`.${css.grid}`);
			if (grid) {
				const scrollTop = grid.scrollTop || 0;
				if (scrollTop < 50) {
					e.preventDefault();
					e.stopPropagation();
					Spotlight.focus('navbar');
				}
			}
		}
	}, []);

	const renderItem = useCallback(({index, ...rest}) => {
		const item = items[index];
		if (!item) return null;

		return (
			<MediaCard
				{...rest}
				key={item.Id}
				item={item}
				serverUrl={serverUrl}
				onSelect={handleSelectItem}
			/>
		);
	}, [items, serverUrl, handleSelectItem]);

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
				<div className={css.empty}>Person not found</div>
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
								Born: {new Date(person.PremiereDate).toLocaleDateString()}
							</div>
						)}
						{person.Overview && (
							<p className={css.overview}>{person.Overview}</p>
						)}
					</div>
				</div>

				{items.length > 0 && (
					<div className={css.filmography}>
						<h2 className={css.sectionTitle}>Filmography ({items.length})</h2>
						<GridContainer className={css.gridContainer}>
							<VirtualGridList
								className={css.grid}
								dataSize={items.length}
								itemRenderer={renderItem}
								itemSize={{minWidth: 200, minHeight: 360}}
								spacing={32}
								onKeyDown={handleGridKeyDown}
								spotlightId="person-grid"
							/>
						</GridContainer>
					</div>
				)}
			</div>
		</div>
	);
};

export default Person;