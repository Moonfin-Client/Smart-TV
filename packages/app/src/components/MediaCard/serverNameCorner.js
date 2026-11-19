// Where a card's top right corner puts what it holds when the card shows a server's name there, shared by the classic
// and modern cards so the two can't drift apart. The watched check, the unplayed count and the Seerr marker move below
// the name, and the plugin's poster labels below those.

import {serverCountOf} from '../../utils/mergedCopies';
import {showsWatchedCheck} from '../../utils/playedState';

// Where the moved badges start: under a server's name, or under a source's smaller name, as Radarr's.
const BELOW_SERVER_NAME = 44;
const BELOW_SOURCE_NAME = 34;
// A badge in that corner is 26px tall, and the labels keep a 6px gap below it.
const BELOW_MOVED_BADGE = 32;

export const serverNameCorner = ({css, item, showServerBadge, showIndicators, showUnplayedCount, bannerOffset = 0}) => {
	// A title several servers hold shows how many instead, and a merged library's tile names no server. Copies all on one
	// server, as a film in its 4K and HD libraries, still name it, since there's no count to show.
	const showsServerName = Boolean((showServerBadge || item?._external) && item?._serverName && serverCountOf(item) < 2 && !item?._mergedType);
	const isSource = Boolean(item?._external);
	const showsWatched = Boolean(showIndicators && showsWatchedCheck(item));
	const below = isSource ? BELOW_SOURCE_NAME : BELOW_SERVER_NAME;
	const movedBadge = showsServerName && (showsWatched || showUnplayedCount);
	const labelsTop = movedBadge ? below + BELOW_MOVED_BADGE : (showsWatched || showsServerName ? 40 : 8);
	return {
		showsServerName,
		// A source's name keeps the size it always had, only a server's name is bigger.
		nameClass: isSource ? `${css.serverBadge} ${css.sourceBadge}` : css.serverBadge,
		// Added to each badge that moves below the name.
		belowNameClass: showsServerName ? ` ${css.belowServerBadge}${isSource ? ` ${css.belowSourceBadge}` : ''}` : '',
		// The Seerr banner along the top pushes the whole corner down.
		labelsTopRight: labelsTop + bannerOffset,
		// For a marker placed by its own style rather than this card's classes.
		movedTop: showsServerName ? below : undefined
	};
};
