import {useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {MUSIC_FOCUS_IDS} from './musicFocus';

import css from './MusicFilterPanel.module.less';

const SpottableButton = Spottable('div');
const PanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

const MUSIC_SORT_CHOICES = [
	{key: 'name', label: $L('Name')},
	{key: 'release_year', label: $L('Release Year')},
	{key: 'date_added', label: $L('Date Added to Library')}
];

const MUSIC_ROW_TOGGLES = [
	{key: 'displayAudioLatest', label: $L('Latest')},
	{key: 'displayAudioLastPlayed', label: $L('Last Played')},
	{key: 'displayAudioFavorites', label: $L('Favorites')},
	{key: 'displayAudioPlaylists', label: $L('Playlists')},
	{key: 'displayAudioAlbumArtists', label: $L('Album Artists')},
	{key: 'displayAudioArtists', label: $L('Artists')},
	{key: 'displayAudioAlbums', label: $L('Albums')}
];

const stopPropagation = (e) => e.stopPropagation();

const MusicFilterPanel = ({settings, onUpdateSetting, onClose}) => {
	const handleSortSelect = useCallback((e) => {
		const key = e.currentTarget?.dataset?.sortKey;
		if (key) onUpdateSetting('audioSortOption', key);
	}, [onUpdateSetting]);

	const handleToggle = useCallback((e) => {
		const key = e.currentTarget?.dataset?.rowKey;
		if (key) onUpdateSetting(key, !settings[key]);
	}, [onUpdateSetting, settings]);

	return (
		<div className={css.overlay} onClick={onClose}>
			<PanelContainer
				className={css.panel}
				spotlightId={MUSIC_FOCUS_IDS.panel}
				onClick={stopPropagation}
			>
				<h2 className={css.title}>{$L('Sort & Filter')}</h2>

				<div className={css.section}>
					<div className={css.sectionLabel}>{$L('Sort By')}</div>
					{MUSIC_SORT_CHOICES.map((option, index) => (
						<SpottableButton
							key={option.key}
							className={`${css.option} ${settings.audioSortOption === option.key ? css.optionActive : ''}`}
							data-sort-key={option.key}
							spotlightId={`music-sort-option-${index}`}
							onClick={handleSortSelect}
						>
							<span className={css.radio}>
								{settings.audioSortOption === option.key && <span className={css.radioFill} />}
							</span>
							<span className={css.optionLabel}>{option.label}</span>
						</SpottableButton>
					))}
				</div>

				<div className={css.section}>
					<div className={css.sectionLabel}>{$L('Show')}</div>
					{MUSIC_ROW_TOGGLES.map((row) => (
						<SpottableButton
							key={row.key}
							className={`${css.option} ${settings[row.key] ? css.optionActive : ''}`}
							data-row-key={row.key}
							onClick={handleToggle}
						>
							<span className={css.check}>
								{settings[row.key] && <span className={css.checkMark} />}
							</span>
							<span className={css.optionLabel}>{row.label}</span>
						</SpottableButton>
					))}
				</div>
			</PanelContainer>
		</div>
	);
};

export default MusicFilterPanel;
