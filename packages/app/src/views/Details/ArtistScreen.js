import $L from '@enact/i18n/$L';

import MediaRow from '../../components/MediaRow';
import RatingsRow from '../../components/RatingsRow';
import {getImageUrl} from '../../utils/helpers';
import {isMdblistEnabled} from '../../services/mdblistApi';
import {DETAIL_ICON_PATHS} from './detailIcons';
import {SpottableDiv, HorizontalContainer} from './detailsSpottables';
import {hidesMediaDescription} from './detailsMedia';

import css from './Details.module.less';

const ArtistScreen = ({
	item,
	serverUrl,
	settings,
	artistAlbums,
	similar,
	onPlay,
	onShuffle,
	onToggleFavorite,
	onSelectItem,
	onFocusRow
}) => (
	<>
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
						<svg viewBox="0 -960 960 960" fill="currentColor"><path d={DETAIL_ICON_PATHS.audio}/></svg>
					</div>
				)}
			</div>
			<div className={css.personInfo}>
				<h1 className={css.title}>{item.Name}</h1>
				<RatingsRow item={item} serverUrl={serverUrl} pluginEnabled={isMdblistEnabled(settings)} />
				{item.Overview && !hidesMediaDescription(item, settings) && <p className={css.overview}>{item.Overview}</p>}
				<HorizontalContainer className={css.actionButtons} spotlightId="details-action-buttons">
					{artistAlbums.length > 0 && (
						<SpottableDiv className={css.btnWrapper} onClick={onPlay} onFocus={onFocusRow} spotlightId="details-primary-btn">
							<div className={css.btnAction}>
								<span className={css.btnIcon}>▶</span>
							</div>
							<span className={css.btnLabel}>{$L('Play')}</span>
						</SpottableDiv>
					)}
					{artistAlbums.length > 0 && (
						<SpottableDiv className={css.btnWrapper} onClick={onShuffle}>
							<div className={css.btnAction}>
								<svg className={css.btnIcon} viewBox="0 -960 960 960" fill="currentColor"><path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 568-568H624v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/></svg>
							</div>
							<span className={css.btnLabel}>{$L('Shuffle')}</span>
						</SpottableDiv>
					)}
					<SpottableDiv className={css.btnWrapper} onClick={onToggleFavorite} spotlightId="details-favorite-btn">
						<div className={css.btnAction}>
							<svg className={`${css.btnIcon} ${item.UserData?.IsFavorite ? css.favorited : ''}`} viewBox="0 -960 960 960" fill="currentColor">
								<path d={DETAIL_ICON_PATHS.favorite}/>
							</svg>
						</div>
						<span className={css.btnLabel}>{item.UserData?.IsFavorite ? $L('Favorited') : $L('Favorite')}</span>
					</SpottableDiv>
				</HorizontalContainer>
			</div>
		</div>

		<div className={css.sectionsContainer}>
			{artistAlbums.length > 0 && (
				<MediaRow
					title={$L('Discography') + ' (' + artistAlbums.length + ')'}
					items={artistAlbums}
					serverUrl={serverUrl}
					cardType="square"
					onSelectItem={onSelectItem}
					className={css.inlineRow}
					rowIndex={0}
				/>
			)}

			{similar.length > 0 && (
				<MediaRow
					title={$L('Similar Artists')}
					items={similar}
					serverUrl={serverUrl}
					cardType="square"
					onSelectItem={onSelectItem}
					className={css.inlineRow}
					rowIndex={1}
				/>
			)}
		</div>
	</>
);

export default ArtistScreen;
