import {useCallback} from 'react';
import $L from '@enact/i18n/$L';

import MediaCard from '../../../components/MediaCard';
import DetailTrackList from '../../../components/DetailTrackList';
import {SeerrChips, SeerrFacts} from '../../../components/seerr/SeerrSections';
import {getImageUrl, formatDuration} from '../../../utils/helpers';
import {castPhotoUrl} from '../detailsMedia';
import {SpottableDiv, RowContainer} from '../detailsSpottables';
import {DETAIL_ICON_PATHS} from '../detailIcons';
import {iconViewBox} from '../../../components/icons/iconViewBox';

import css from './SpotlightGrids.module.less';

const CARD_TYPE = {portrait: 'portrait', landscape: 'landscape', square: 'square'};

const Icon = ({path}) => (
	<svg className={css.icon} viewBox={iconViewBox(path)} fill="currentColor" aria-hidden="true">
		<path d={path} />
	</svg>
);

const MediaGrid = ({items, serverUrl, aspect, onSelect, firstSpotlightId}) => (
	<RowContainer className={css.grid}>
		{items.map((item, index) => (
			<MediaCard
				key={`${item.Id}-${index}`}
				item={item}
				serverUrl={serverUrl}
				cardType={CARD_TYPE[aspect] || 'portrait'}
				onSelect={onSelect}
				spotlightId={index === 0 ? firstSpotlightId : undefined}
			/>
		))}
	</RowContainer>
);

// A Seerr credit names what the person did on the title, which the card itself has no room
// for, so it sits under the card.
const SeerrGrid = ({items, serverUrl, showCredit, onSelect, firstSpotlightId}) => (
	<RowContainer className={css.grid}>
		{items.map((item, index) => (
			<div key={`${item.Id}-${index}`} className={css.creditCell}>
				<MediaCard
					item={item}
					serverUrl={serverUrl}
					cardType="portrait"
					onSelect={onSelect}
					spotlightId={index === 0 ? firstSpotlightId : undefined}
				/>
				{showCredit && item._seerrCredit && <span className={css.creditLine}>{item._seerrCredit}</span>}
			</div>
		))}
	</RowContainer>
);

const PeopleGrid = ({people, serverUrl, onSelect, firstSpotlightId}) => {
	const handleClick = useCallback((ev) => {
		const id = ev.currentTarget.dataset.personId;
		const person = people.find((p) => (p.Id || p.Name) === id);
		if (person) onSelect?.(person);
	}, [people, onSelect]);

	return (
		<RowContainer className={css.grid}>
			{people.map((person, index) => {
				const key = person.Id || person.Name;
				const photo = castPhotoUrl(person, serverUrl, 300);
				return (
					<SpottableDiv
						key={`${key}-${index}`}
						className={css.personCard}
						data-person-id={key}
						spotlightId={index === 0 ? firstSpotlightId : undefined}
						onClick={handleClick}
					>
						<div className={css.personPhoto}>
							{photo ? <img src={photo} alt="" /> : <div className={css.personPhotoEmpty}><Icon path={DETAIL_ICON_PATHS.group} /></div>}
						</div>
						<span className={css.personName}>{person.Name}</span>
						{person.Role && <span className={css.personRole}>{person.Role}</span>}
					</SpottableDiv>
				);
			})}
		</RowContainer>
	);
};

const StudiosGrid = ({studios, onSelect, firstSpotlightId}) => {
	const handleClick = useCallback((ev) => {
		const name = ev.currentTarget.dataset.studioName;
		if (name) onSelect?.(name);
	}, [onSelect]);

	return (
		<RowContainer className={css.grid}>
			{studios.map((studio, index) => (
				<SpottableDiv
					key={studio.key}
					className={css.studioCard}
					data-studio-name={studio.name}
					spotlightId={index === 0 ? firstSpotlightId : undefined}
					onClick={handleClick}
				>
					<div className={css.studioImage}>
						{studio.logo ? <img src={studio.logo} alt={studio.name} /> : <Icon path={DETAIL_ICON_PATHS.series} />}
					</div>
					<span className={css.studioName}>{studio.name}</span>
				</SpottableDiv>
			))}
		</RowContainer>
	);
};

const ChaptersGrid = ({item, serverUrl, onSelect, firstSpotlightId}) => {
	const handleClick = useCallback((ev) => {
		const ticks = ev.currentTarget.dataset.startTicks;
		if (ticks != null) onSelect?.(Number(ticks));
	}, [onSelect]);

	return (
		<RowContainer className={css.grid}>
			{(item.Chapters || []).map((chapter, index) => {
				const thumb = chapter.ImageTag
					? getImageUrl(serverUrl, item.Id, `Chapter/${index}`, {maxWidth: 400, quality: 90, tag: chapter.ImageTag})
					: null;
				return (
					<SpottableDiv
						key={index}
						className={css.chapterCard}
						data-start-ticks={chapter.StartPositionTicks}
						spotlightId={index === 0 ? firstSpotlightId : undefined}
						onClick={handleClick}
					>
						<div className={css.chapterThumb}>
							{thumb ? <img src={thumb} alt="" /> : <div className={css.chapterThumbEmpty} />}
							<span className={css.chapterTime}>{formatDuration(chapter.StartPositionTicks)}</span>
						</div>
						<span className={css.chapterName}>{chapter.Name || `${$L('Chapter')} ${index + 1}`}</span>
					</SpottableDiv>
				);
			})}
		</RowContainer>
	);
};

// One section of an open card, drawn according to what it holds. Only the first section of a
// modal is handed a spotlight id, which is where the remote lands when the modal opens.
const SpotlightSection = ({section, serverUrl, actions, seerr, firstSpotlightId}) => {
	switch (section.kind) {
		case 'media':
			return <MediaGrid items={section.items} serverUrl={serverUrl} aspect={section.aspect} onSelect={actions.openItem} firstSpotlightId={firstSpotlightId} />;
		case 'seerr':
			return <SeerrGrid items={section.items} serverUrl={serverUrl} showCredit={section.showCredit} onSelect={actions.openSeerrItem} firstSpotlightId={firstSpotlightId} />;
		case 'people':
			return <PeopleGrid people={section.people} serverUrl={serverUrl} onSelect={actions.openPerson} firstSpotlightId={firstSpotlightId} />;
		case 'studios':
			return <StudiosGrid studios={section.studios} onSelect={actions.openStudio} firstSpotlightId={firstSpotlightId} />;
		case 'chapters':
			return <ChaptersGrid item={section.item} serverUrl={serverUrl} onSelect={actions.playFromChapter} firstSpotlightId={firstSpotlightId} />;
		case 'tracks':
			return (
				<DetailTrackList
					tracks={section.tracks}
					isAudiobook={section.isAudiobook}
					groupByDisc={section.groupByDisc}
					isPlaylist={section.isPlaylist}
					showAlbum={section.showAlbum}
					manage={section.manage}
					onPlayTrack={actions.playTrack}
					onReorder={actions.reorderTrack}
					onRemove={actions.removeTrack}
					firstSpotlightId={firstSpotlightId}
				/>
			);
		case 'seerrChips':
			return <SeerrChips details={seerr?.details} mediaType={seerr?.mediaType} seerrNav={seerr?.nav} />;
		case 'seerrFacts':
			return <SeerrFacts details={seerr?.details} mediaType={seerr?.mediaType} />;
		default:
			return null;
	}
};

export default SpotlightSection;
