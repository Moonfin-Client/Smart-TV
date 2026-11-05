/* eslint-disable react/jsx-no-bind */
import $L from '@enact/i18n/$L';

import {ReorderRow, useCommitOnLeave} from './settingsRows';
import SettingsView, {TitleAction} from './SettingsView';

import css from './Settings.module.less';

const ICONS = {
	detail: {
		seerrRequest: 'add', seerrRequest4k: 'add', shuffle: 'shuffle_rounded', version: 'video_file',
		audio: 'audiotrack', subtitles: 'subtitles', trailer: 'movie_outlined', watchWithGroup: 'groups_rounded',
		watched: 'check_circle_outline', favorite: 'favorite_border', personalRating: 'star_outline',
		goToSeries: 'tv', playlist: 'playlist_add', collection: 'library_add', deleteFiles: 'delete_outline',
		artwork: 'image', seerrWatchlist: 'bookmark_border', seerrReportIssue: 'report_problem_outlined',
		seerrManage: 'rule', keepAsComplete: 'task_alt', admin: 'settings'
	},
	osd: {
		chapters: 'bookmark_outline_rounded', subtitles: 'subtitles_outlined', audio: 'audiotrack_outlined',
		castAndCrew: 'people_outline_rounded', quality: 'video_settings_outlined', zoom: 'zoom_out_map',
		sleep: 'bedtime', info: 'info_outline_rounded'
	},
	metadata: {
		year: 'calendar_today_outlined', parentalRating: 'verified_user_outlined', runtimeAndSeasons: 'schedule_outlined',
		status: 'timelapse_outlined', upcomingEpisodeDate: 'event_available_outlined', genres: 'category_outlined',
		seerrAvailability: 'cloud_download_outlined'
	}
};

const TITLES = {
	osd: () => $L('Player Buttons'),
	metadata: () => $L('Metadata Row'),
	detail: () => $L('Action Buttons')
};

const DESCRIPTIONS = {
	osd: () => $L('Playback controls are always shown. Everything below is up to you.'),
	metadata: () => $L('Turn metadata items on or off, and arrange the order they appear on the details screen.'),
	detail: () => $L('Play is always first. Everything else is up to you.')
};

// The details row, the player controls and the details metadata row, each a list of cards the
// remote rearranges. The arrangement is written back when the screen closes.
const ButtonLayoutView = ({kind, tempButtons, onToggleButton, onMoveButton, onReset, onLeave}) => {
	useCommitOnLeave(onLeave);
	const layout = TITLES[kind] ? kind : 'detail';

	return (
		<SettingsView
			spotlightId='button-layout-view'
			title={TITLES[layout]()}
			clean
			action={<TitleAction icon='restore' label={$L('Reset to defaults')} onClick={onReset} />}
		>
			<div className={css.editorHint}>{DESCRIPTIONS[layout]()}</div>
			<div className={`${css.editorHint} ${css.editorHintLast}`}>
				{$L('Press left or right to move the highlighted button.')}
			</div>
			{tempButtons.map((btn, index) => (
				<ReorderRow
					key={btn.id}
					spotlightId={`layoutbtn-${btn.id}`}
					title={$L(btn.label)}
					subtitle={btn.subtitle && $L(btn.subtitle)}
					icon={ICONS[layout][btn.id] || 'tune'}
					buttons
					enabled={btn.enabled}
					isFirst={index === 0}
					isLast={index === tempButtons.length - 1}
					onToggle={() => onToggleButton(btn.id)}
					onMove={(delta) => onMoveButton(btn.id, delta)}
				/>
			))}
		</SettingsView>
	);
};

export default ButtonLayoutView;
