import {useMemo} from 'react';

import CoreDialog from '../../components/CoreDialog';
import MessageMarkdown from '../../components/ServerMessagesDialog/MessageMarkdown';
import PagedText from '../../components/PagedText';
import {parseMarkdown} from '../../utils/markdown';
import {reviewMeta} from '../../utils/tmdbReviews';

import css from './Reviews.module.less';

// A review in full, under the reviewer's name, score and date. A TV has nowhere to open the
// TMDB link, so it's left off.
const ReviewDialog = ({review, onClose}) => {
	const blocks = useMemo(() => (review ? parseMarkdown(review.content) : []), [review]);
	const meta = review ? reviewMeta(review) : '';

	return (
		<CoreDialog
			open={Boolean(review)}
			onClose={onClose}
			title={review?.author}
			subtitle={meta}
			spotlightId="review-dialog"
			className={css.dialog}
			bodyClassName={css.dialogBody}
		>
			<PagedText className={css.dialogText}>
				<MessageMarkdown blocks={blocks} />
			</PagedText>
		</CoreDialog>
	);
};

export default ReviewDialog;
