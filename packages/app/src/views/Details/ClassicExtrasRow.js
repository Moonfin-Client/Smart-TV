import {formatDuration, getImageUrl} from '../../utils/helpers';
import {SpottableDiv, RowContainer} from './detailsSpottables';
import {handleScrollerFocus} from './detailsFocus';

import css from './Details.module.less';

const ClassicExtrasRow = ({title, items, serverUrl, onExtraSelect}) => (
	<RowContainer className={css.section}>
		<div className={css.sectionHeader}>
			<h3 className={css.sectionTitle}>{title}</h3>
		</div>
		<div className={css.sectionScroll} onFocus={handleScrollerFocus}>
			{items.map(extra => {
				const extraThumbUrl = extra.ImageTags?.Primary
					? getImageUrl(serverUrl, extra.Id, 'Primary', {maxWidth: 400, quality: 80})
					: null;
				const extraDuration = extra.RunTimeTicks ? formatDuration(extra.RunTimeTicks) : '';

				return (
					<SpottableDiv
						key={extra.Id}
						className={css.extraCard}
						data-extra-id={extra.Id}
						onClick={onExtraSelect}
					>
						<div className={css.extraThumb}>
							{extraThumbUrl ? (
								<img src={extraThumbUrl} alt="" />
							) : (
								<div className={css.extraThumbPlaceholder}>
									<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
								</div>
							)}
						</div>
						<div className={css.extraInfo}>
							<span className={css.extraName}>{extra.Name}</span>
							{extraDuration && <span className={css.extraDuration}>{extraDuration}</span>}
						</div>
					</SpottableDiv>
				);
			})}
		</div>
	</RowContainer>
);

export default ClassicExtrasRow;
