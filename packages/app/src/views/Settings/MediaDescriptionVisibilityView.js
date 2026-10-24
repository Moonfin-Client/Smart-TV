/* eslint-disable react/jsx-no-bind */
import {Fragment} from 'react';
import $L from '@enact/i18n/$L';

import {SectionTitle, ToggleRow} from './settingsRows';
import SettingsView from './SettingsView';

import css from './Settings.module.less';

// Subpage allowing granular control over media description visibility across various local
// and Seerr detail pages.
const MediaDescriptionVisibilityView = ({settings, seerrAvailable, onToggle}) => (
	<SettingsView spotlightId='media-description-visibility-view' title={$L('Toggle Media Description Visibility')} clean>
		<div className={`${css.editorHint} ${css.editorHintSolo}`}>
			{$L('Hide media descriptions from various detail pages.')}
		</div>
		<SectionTitle>{$L('Local Content')}</SectionTitle>
		<ToggleRow
			settingKey='hideDetailsMediaDescriptionMovie'
			title={$L('Movies')}
			desc={$L('Hide descriptions on movie detail pages.')}
			icon='movie_outlined'
			checked={Boolean(settings.hideDetailsMediaDescriptionMovie)}
			onToggle={() => onToggle('hideDetailsMediaDescriptionMovie')}
		/>
		<ToggleRow
			settingKey='hideDetailsMediaDescriptionShow'
			title={$L('TV Shows')}
			desc={$L('Hide descriptions on TV show detail pages.')}
			icon='tv'
			checked={Boolean(settings.hideDetailsMediaDescriptionShow)}
			onToggle={() => onToggle('hideDetailsMediaDescriptionShow')}
		/>
		<ToggleRow
			settingKey='hideDetailsMediaDescriptionSeason'
			title={$L('Seasons')}
			desc={$L('Hide descriptions on season detail pages.')}
			icon='video_library_outlined'
			checked={Boolean(settings.hideDetailsMediaDescriptionSeason)}
			onToggle={() => onToggle('hideDetailsMediaDescriptionSeason')}
		/>
		<ToggleRow
			settingKey='hideDetailsMediaDescriptionEpisode'
			title={$L('Episodes')}
			desc={$L('Hide descriptions on episode detail pages.')}
			icon='play_circle'
			checked={Boolean(settings.hideDetailsMediaDescriptionEpisode)}
			onToggle={() => onToggle('hideDetailsMediaDescriptionEpisode')}
		/>
		<ToggleRow
			settingKey='hideDetailsMediaDescriptionBoxSet'
			title={$L('Collections')}
			desc={$L('Hide descriptions on box set and collection detail pages.')}
			icon='collections_bookmark_outlined'
			checked={Boolean(settings.hideDetailsMediaDescriptionBoxSet)}
			onToggle={() => onToggle('hideDetailsMediaDescriptionBoxSet')}
		/>
		<ToggleRow
			settingKey='hideDetailsMediaDescriptionBook'
			title={$L('Books')}
			desc={$L('Hide descriptions on book and audiobook detail pages.')}
			icon='library_books'
			checked={Boolean(settings.hideDetailsMediaDescriptionBook)}
			onToggle={() => onToggle('hideDetailsMediaDescriptionBook')}
		/>
		<ToggleRow
			settingKey='hideDetailsMediaDescriptionPerson'
			title={$L('People')}
			desc={$L('Hide descriptions on person and actor detail pages.')}
			icon='person'
			checked={Boolean(settings.hideDetailsMediaDescriptionPerson)}
			onToggle={() => onToggle('hideDetailsMediaDescriptionPerson')}
		/>
		<ToggleRow
			settingKey='hideDetailsMediaDescriptionMusic'
			title={$L('Music')}
			desc={$L('Hide descriptions on album and artist detail pages.')}
			icon='music_note'
			checked={Boolean(settings.hideDetailsMediaDescriptionMusic)}
			onToggle={() => onToggle('hideDetailsMediaDescriptionMusic')}
		/>
		{seerrAvailable && (
			<Fragment>
				<SectionTitle>{$L('Seerr Content')}</SectionTitle>
				<ToggleRow
					settingKey='hideDetailsMediaDescriptionSeerrMovie'
					title={$L('Movies')}
					desc={$L('Hide descriptions on Seerr movie discovery pages.')}
					icon='movie_outlined'
					checked={Boolean(settings.hideDetailsMediaDescriptionSeerrMovie)}
					onToggle={() => onToggle('hideDetailsMediaDescriptionSeerrMovie')}
				/>
				<ToggleRow
					settingKey='hideDetailsMediaDescriptionSeerrShow'
					title={$L('TV Shows')}
					desc={$L('Hide descriptions on Seerr TV show discovery pages.')}
					icon='tv'
					checked={Boolean(settings.hideDetailsMediaDescriptionSeerrShow)}
					onToggle={() => onToggle('hideDetailsMediaDescriptionSeerrShow')}
				/>
				<ToggleRow
					settingKey='hideDetailsMediaDescriptionSeerrCollection'
					title={$L('Collections')}
					desc={$L('Hide descriptions on Seerr collection discovery pages.')}
					icon='collections_bookmark_outlined'
					checked={Boolean(settings.hideDetailsMediaDescriptionSeerrCollection)}
					onToggle={() => onToggle('hideDetailsMediaDescriptionSeerrCollection')}
				/>
			</Fragment>
		)}
	</SettingsView>
);

export default MediaDescriptionVisibilityView;
