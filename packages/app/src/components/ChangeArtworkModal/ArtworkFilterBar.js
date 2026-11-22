import $L from '@enact/i18n/$L';

import {SpottableButton} from './artworkSpottables';

import css from './ChangeArtworkModal.module.less';

// Filters that apply to every category at once. Hidden once a single category
// is expanded, where the resolution chips take over.
const ArtworkFilterBar = ({hasSources, onlyShowInterfaceLanguage, onOpenSources, onToggleLanguage, onClearAll}) => (
	<div className={css.filterBar}>
		{hasSources && (
			<SpottableButton className={css.filterBtn} onClick={onOpenSources} spotlightId="sources-filter-btn">
				{$L('Sources')}
			</SpottableButton>
		)}
		<SpottableButton
			className={`${css.filterBtn} ${onlyShowInterfaceLanguage ? css.activeFilter : ''}`}
			onClick={onToggleLanguage}
			spotlightId="lang-filter-btn"
		>
			{onlyShowInterfaceLanguage ? $L('Show All Languages') : $L('Local Language Only')}
		</SpottableButton>
		{onClearAll && (
			<SpottableButton
				className={`${css.filterBtn} ${css.clearAllBtn}`}
				onClick={onClearAll}
				spotlightId="clear-all-btn"
			>
				{$L('Clear All Artwork')}
			</SpottableButton>
		)}
	</div>
);

export default ArtworkFilterBar;
