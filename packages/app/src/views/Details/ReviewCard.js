import {memo, useCallback, useState} from 'react';

import {reviewInitial, reviewMeta, reviewPreview} from '../../utils/tmdbReviews';
import {SpottableDiv} from './detailsSpottables';

import css from './Reviews.module.less';

const ReviewAuthor = ({review}) => {
	const [broken, setBroken] = useState(false);
	const handleError = useCallback(() => setBroken(true), []);
	const meta = reviewMeta(review);

	return (
		<div className={css.author}>
			<div className={css.avatar}>
				{review.avatarUrl && !broken
					? <img src={review.avatarUrl} alt="" onError={handleError} />
					: reviewInitial(review.author)}
			</div>
			<div className={css.authorText}>
				<div className={css.authorName}>{review.author}</div>
				{meta && <div className={css.meta}>{meta}</div>}
			</div>
		</div>
	);
};

const ReviewCard = memo(({review, onSelect, spotlightId}) => {
	const handleClick = useCallback(() => onSelect?.(review), [onSelect, review]);

	return (
		<SpottableDiv className={css.card} onClick={handleClick} spotlightId={spotlightId}>
			<ReviewAuthor review={review} />
			<div className={css.preview}>{reviewPreview(review.content)}</div>
		</SpottableDiv>
	);
});

export const ReviewCards = ({reviews, onSelect, firstSpotlightId}) => reviews.map((review, index) => (
	<ReviewCard
		key={review.id}
		review={review}
		onSelect={onSelect}
		spotlightId={index === 0 ? firstSpotlightId : undefined}
	/>
));

export default ReviewCard;
