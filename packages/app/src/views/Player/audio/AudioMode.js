import {useRef, useCallback} from 'react';
import $L from '@enact/i18n/$L';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {getImageUrl} from '../../../utils/helpers';
import {SpottableButton, SpottableDiv, IconFavorite, IconFavoriteFilled} from '../PlayerConstants';
import AmbientBackground from './AmbientBackground';
import AudioQualityBadge from './AudioQualityBadge';
import QueuePanel from './QueuePanel';
import LyricsPanel from './LyricsPanel';

import css from './AudioMode.module.less';

const PanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');
const TabsContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');

const IconMusicNote = () => (
	<svg viewBox="0 -960 960 960" fill="currentColor" width="96" height="96">
		<path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v382q0 66-47 113t-113 47Z" />
	</svg>
);

const artUrlFor = (item, serverUrl) => {
	const base = item?._serverUrl || serverUrl;
	if (item?.ImageTags?.Primary) return getImageUrl(base, item.Id, 'Primary', {maxHeight: 600, quality: 90});
	if (item?.AlbumId && item?.AlbumPrimaryImageTag) {
		return getImageUrl(base, item.AlbumId, 'Primary', {maxHeight: 600, quality: 90, tag: item.AlbumPrimaryImageTag});
	}
	return null;
};

// The audio surface: ambient background, header, and a split of the now playing
// column against the queue or lyrics panel. Both platform players render this so
// the music UI only exists once.
const AudioMode = ({
	item,
	title,
	subtitle,
	serverUrl,
	isFavorite,
	onToggleFavorite,
	focusRow,
	activeTab,
	onSelectTab,
	onEnterPanel,
	audioPlaylist,
	onSelectTrack,
	lyrics,
	onSeekToLine
}) => {
	const queueScrollRef = useRef(null);
	const artUrl = artUrlFor(item, serverUrl);
	const hasLyrics = lyrics.lines.length > 0;
	const panelIsLyrics = activeTab === 'lyrics' && hasLyrics;
	const panelFocused = focusRow === 'panel';

	const handleTabClick = useCallback((e) => {
		const tab = e.currentTarget.dataset.tab;
		if (tab === activeTab) onEnterPanel();
		else onSelectTab(tab);
	}, [activeTab, onSelectTab, onEnterPanel]);

	return (
		<AmbientBackground artworkUrl={artUrl}>
			<div className={css.header}>
				<div className={css.headerSpacer} />
				<div className={css.headerCenter}><AudioQualityBadge item={item} /></div>
				<div className={css.headerSpacer}>
					<SpottableButton
						className={`${css.favoriteBtn} ${isFavorite ? css.favoriteActive : ''}`}
						spotlightId="audio-favorite-btn"
						spotlightDisabled={focusRow !== 'favorite'}
						onClick={onToggleFavorite}
						aria-label={$L('Favorite')}
					>
						{isFavorite ? <IconFavoriteFilled /> : <IconFavorite />}
					</SpottableButton>
				</div>
			</div>

			<div className={css.body}>
				<div className={css.nowPlaying}>
					<div className={css.art}>
						{artUrl
							? <img className={css.artImg} src={artUrl} alt={item?.Name} />
							: <div className={css.artPlaceholder}><IconMusicNote /></div>}
					</div>
					<h1 className={css.trackTitle}>{title}</h1>
					{subtitle && <p className={css.trackArtist}>{subtitle}</p>}
					{item?.Album && <p className={css.trackAlbum}>{item.Album}</p>}
				</div>

				<div className={css.panelColumn}>
					<TabsContainer className={css.tabs} spotlightId="audio-tabs">
						<SpottableDiv
							className={`${css.tab} ${!panelIsLyrics ? css.tabActive : ''}`}
							data-tab="queue"
							spotlightDisabled={focusRow !== 'tabs'}
							onClick={handleTabClick}
						>
							{$L('Up Next')}
						</SpottableDiv>
						{hasLyrics && (
							<SpottableDiv
								className={`${css.tab} ${panelIsLyrics ? css.tabActive : ''}`}
								data-tab="lyrics"
								spotlightDisabled={focusRow !== 'tabs'}
								onClick={handleTabClick}
							>
								{$L('Lyrics')}
							</SpottableDiv>
						)}
					</TabsContainer>

					<PanelContainer className={css.panel} spotlightId="audio-panel">
						{panelIsLyrics ? (
							<LyricsPanel
								lines={lyrics.lines}
								activeIndex={lyrics.activeIndex}
								isLoading={lyrics.isLoading}
								error={lyrics.error}
								isSynced={lyrics.isSynced}
								isFocusable={panelFocused}
								onSeekToLine={onSeekToLine}
							/>
						) : (
							<QueuePanel
								items={audioPlaylist}
								currentId={item?.Id}
								serverUrl={serverUrl}
								focusDisabled={!panelFocused}
								onSelectTrack={onSelectTrack}
								scrollerRef={queueScrollRef}
							/>
						)}
					</PanelContainer>
				</div>
			</div>
		</AmbientBackground>
	);
};

export default AudioMode;
