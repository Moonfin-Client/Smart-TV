import AnimeMarkerPills from './AnimeMarkerPills';
import {useEpisodeMarker, useItemAudio} from './useAnimeMarkers';

import css from './AnimeMarkerPills.module.less';

// How long a card waits before asking. So that the cards load in first bevor the pills come.
const CARD_DELAY_MS = 700;

// The pills for one episode, fetching what it needs itself.
export const AnimeEpisodePills = ({episode, serverUrl, compact, large, className}) => {
	const marker = useEpisodeMarker(episode, {serverUrl});
	return <AnimeMarkerPills marker={marker} compact={compact} large={large} className={className} />;
};

// The pills for whatever a detail screen is showing.
export const AnimeItemPills = ({item, serverUrl, compact, large, className}) => {
	const isEpisode = item?.Type === 'Episode';
	const marker = useEpisodeMarker(isEpisode ? item : null, {serverUrl});
	const audio = useItemAudio(item?.Type === 'Movie' ? item : null, {serverUrl});

	return <AnimeMarkerPills marker={marker} audio={audio} compact={compact} large={large} className={className} />;
};

// The pill drawn over a home row card's artwork.
export const AnimeCardPill = ({item, serverUrl, hasProgressBar}) => {
	const isEpisode = item?.Type === 'Episode';
	const marker = useEpisodeMarker(isEpisode ? item : null, {serverUrl, delayMs: CARD_DELAY_MS});
	const audio = useItemAudio(item?.Type === 'Movie' ? item : null, {serverUrl, delayMs: CARD_DELAY_MS});

	return (
		<AnimeMarkerPills
			marker={marker}
			audio={audio}
			compact
			max={1}
			className={`${css.cardOverlay} ${hasProgressBar ? css.aboveProgress : ''}`}
		/>
	);
};
