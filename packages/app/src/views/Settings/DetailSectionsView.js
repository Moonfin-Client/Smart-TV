/* eslint-disable react/jsx-no-bind */
import {Fragment} from 'react';
import $L from '@enact/i18n/$L';

import {DETAIL_SECTION_GROUPS, offeredSections, sectionVisibility} from '../../utils/detailSectionLayout';
import {ReorderRow, SectionTitle} from './settingsRows';
import SettingsView from './SettingsView';

import css from './Settings.module.less';

const ICONS = {
	logo: 'branding_watermark_outlined', tagline: 'format_quote', poster: 'image_outlined', versionBadge: 'video_file_outlined',
	upNext: 'skip_next_outlined',
	cast: 'people_outline', crew: 'movie_creation_outlined', studios: 'business_outlined', chapters: 'bookmarks_outlined',
	extras: 'video_library_outlined', collections: 'collections_bookmark_outlined', moreLikeThis: 'recommend_outlined', reviews: 'rate_review',
	moreEpisodes: 'view_list_outlined', mediaInfo: 'info_outline', seerrGenresTags: 'sell_outlined', seerrStats: 'bar_chart',
	seerrStreaming: 'ondemand_video', seerrRecommendations: 'auto_awesome_outlined', seerrSimilar: 'grid_view_outlined',
	seerrCollection: 'collections_outlined',
	seerrPersonAppearances: 'theaters_outlined', seerrPersonCrew: 'engineering_outlined', biography: 'article_outlined',
	birthplace: 'place_outlined', guestAppearances: 'person_add_alt_outlined', musicVideos: 'music_video_outlined',
	playlistOrder: 'format_list_numbered'
};

// Switches for the parts of the Details screen, limited to what the chosen style draws. The
// hidden list is shared, so a section switched off under one style stays off after switching
// to another. Each press writes straight away, there is no order to arrange first.
const DetailSectionsView = ({style, seerrAvailable, seerrLabel, hidden, onToggle}) => {
	const shows = sectionVisibility(hidden);
	const offered = offeredSections(style, seerrAvailable);

	return (
		<SettingsView spotlightId='detail-sections-view' title={$L('Sections')} clean>
			<div className={`${css.editorHint} ${css.editorHintSolo}`}>
				{$L('Only the sections the current Details screen style can show are listed. Hiding one hides it in every style that has it.')}
			</div>
			{DETAIL_SECTION_GROUPS.map((group) => {
				const sections = offered.filter((section) => section.group === group.id);
				if (sections.length === 0) return null;
				return (
					<Fragment key={group.id}>
						<SectionTitle>{group.id === 'seerr' ? seerrLabel : $L(group.label)}</SectionTitle>
						{sections.map((section) => (
							<ReorderRow
								key={section.id}
								spotlightId={`detail-section-${section.id}`}
								title={$L(section.label)}
								subtitle={section.subtitle && $L(section.subtitle)}
								icon={ICONS[section.id] || 'dashboard_customize_outlined'}
								buttons
								fixed
								enabled={shows(section.id)}
								onToggle={() => onToggle(section.id)}
							/>
						))}
					</Fragment>
				);
			})}
		</SettingsView>
	);
};

export default DetailSectionsView;
