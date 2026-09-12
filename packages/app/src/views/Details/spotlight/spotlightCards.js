import $L from '@enact/i18n/$L';

import {DETAIL_ICON_PATHS} from '../detailIcons';
import {groupExtrasByCategory, getExtraCategoryLabel} from '../extraCategories';
import {mergeMissingByReleaseOrder} from '../seerrMissingCollectionItems';
import {
	spotlightItemImageUrl,
	spotlightLandscapeImageUrl,
	firstLandscapeImageUrl,
	firstPosterImageUrl,
	firstChapterImageUrl
} from './spotlightImages';

// The summary cards reuse the detail screen's own icon set rather than carrying a second one.
export const CARD_ICONS = {
	people: DETAIL_ICON_PATHS.group,
	chaptersExtras: DETAIL_ICON_PATHS.trailer,
	// The detail icon set has nothing for a recommendation, so the watchlist bookmark stands
	// in: a card of titles to line up next.
	similar: DETAIL_ICON_PATHS.watchlist,
	collections: DETAIL_ICON_PATHS.collection,
	episodes: DETAIL_ICON_PATHS.series,
	tracks: DETAIL_ICON_PATHS.audio,
	playlist: DETAIL_ICON_PATHS.playlist,
	filmography: DETAIL_ICON_PATHS.trailer
};

// A runtime for a card subtitle or the hero's metadata row: "1h 32m", "2h", or "48m". The
// shared formatter says "2h 0m" for a round number of hours, which reads badly in a subtitle.
export const spotlightRuntimeLabel = (ticks) => {
	const totalMinutes = Math.floor((ticks || 0) / 600000000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
	return `${minutes}m`;
};

// Both wordings stay written out so the string extractor can find them.
const countLabel = (count, one, many) => (count === 1 ? one : many.replace('{count}', String(count)));

// The thumbnail the Collections card borrows, which is the first artwork any of them holds.
// Stops at the first hit rather than flattening every collection to look.
const firstCollectionImageUrl = (serverUrl, collections) => {
	for (const collection of collections) {
		const url = firstLandscapeImageUrl(serverUrl, collection.items || []);
		if (url) return url;
	}
	return null;
};

const joinSubtitle = (parts) => parts.filter(Boolean).join(' · ');

const mediaSection = (title, items, aspect = 'portrait') =>
	({kind: 'media', title, count: items.length, items, aspect});

const seerrSection = (title, items, showCredit = false) =>
	({kind: 'seerr', title, count: items.length, items, showCredit});

const peopleSection = (title, people) => ({kind: 'people', title, count: people.length, people});

// A cast list can name the same person twice, once as an actor and once as a guest star, so
// the repeats are folded into one entry carrying both roles.
export const dedupePeople = (people = []) => {
	const byKey = new Map();
	people.forEach((person) => {
		const key = person?.Id || person?.Name || '';
		if (!key) return;
		const held = byKey.get(key);
		if (!held) {
			byKey.set(key, {...person});
			return;
		}
		const roles = [held.Role, person.Role].filter(Boolean);
		const unique = [...new Set(roles.join(' · ').split(' · ').filter(Boolean))];
		if (unique.length) held.Role = unique.join(' · ');
	});
	return [...byKey.values()];
};

class CardBuilder {
	constructor(state) {
		this.s = state;
	}

	// Which cards this item gets and in what order, each still unbuilt so a caller after one
	// card does not pay for the rest.
	factories() {
		const {item, seerrOnly} = this.s;
		if (seerrOnly) {
			return {people: () => this.peopleCard(), similar: () => this.similarCard()};
		}
		switch (item?.Type) {
			case 'Series': return {
				seasons: () => this.seasonsCard(),
				people: () => this.peopleCard(),
				chapters_extras: () => this.chaptersExtrasCard(),
				similar: () => this.similarCard(),
				collections: () => this.collectionsCard()
			};
			case 'Season': return {
				episodes: () => this.episodesCard($L('Seasons and Episodes')),
				people: () => this.peopleCard(),
				chapters_extras: () => this.chaptersExtrasCard(),
				similar: () => this.similarCard()
			};
			case 'Episode': return {
				episodes: () => this.episodesCard($L('More Episodes')),
				people: () => this.peopleCard(),
				chapters_extras: () => this.chaptersExtrasCard(),
				similar: () => this.similarCard()
			};
			case 'MusicAlbum':
			case 'AudioBook':
			case 'Book': return {tracks: () => this.tracksCard(), similar: () => this.similarCard()};
			case 'Playlist': return {playlist: () => this.playlistCard()};
			case 'MusicArtist': return {albums: () => this.albumsCard(), similar: () => this.similarCard()};
			case 'Person': return {filmography: () => this.filmographyCard()};
			case 'BoxSet': return {
				boxset_items: () => this.boxSetItemsCard(),
				people: () => this.boxSetPeopleCard(),
				playlist_order: () => this.playlistOrderCard()
			};
			default: return {
				people: () => this.peopleCard(),
				chapters_extras: () => this.chaptersExtrasCard(),
				similar: () => this.similarCard(),
				collections: () => this.collectionsCard()
			};
		}
	}

	build() {
		return Object.values(this.factories()).map((make) => make()).filter(Boolean);
	}

	buildOne(id) {
		const make = this.factories()[id];
		return make ? make() : null;
	}

	peopleSubtitle(peopleCount, studioCount) {
		return joinSubtitle([
			peopleCount > 0 ? countLabel(peopleCount, $L('1 person'), $L('{count} people')) : null,
			studioCount > 0 ? countLabel(studioCount, $L('1 studio'), $L('{count} studios')) : null
		]);
	}

	studiosSection() {
		const {studioCards = []} = this.s;
		return {kind: 'studios', title: $L('Studios'), count: studioCards.length, studios: studioCards};
	}

	peopleCard() {
		const {cast = [], crew = [], studioCards = []} = this.s;
		const people = dedupePeople(cast);
		if (!people.length && !crew.length && !studioCards.length) return null;

		const peopleCount = new Set([
			...people.map((p) => p.Id || p.Name),
			...crew.map((p) => p.Id || p.Name)
		]).size;

		return {
			id: 'people',
			title: $L('Cast, Crew, and Studios'),
			subtitle: this.peopleSubtitle(peopleCount, studioCards.length),
			imageUrl: this.s.fallbackImageUrl,
			icon: CARD_ICONS.people,
			sections: [
				people.length ? peopleSection($L('Cast'), people) : null,
				crew.length ? peopleSection($L('Crew'), crew) : null,
				studioCards.length ? this.studiosSection() : null
			].filter(Boolean)
		};
	}

	chaptersExtrasCard() {
		const {item, serverUrl, extras = [], fallbackImageUrl} = this.s;
		const chapters = item?.Chapters || [];
		if (!chapters.length && !extras.length) return null;

		return {
			id: 'chapters_extras',
			title: $L('Chapters and Extras'),
			subtitle: joinSubtitle([
				chapters.length ? countLabel(chapters.length, $L('1 chapter'), $L('{count} chapters')) : null,
				extras.length ? countLabel(extras.length, $L('1 extra'), $L('{count} extras')) : null
			]),
			imageUrl: firstChapterImageUrl(serverUrl, item) ||
				(extras.length ? spotlightLandscapeImageUrl(serverUrl, extras[0], {fallbackUrl: fallbackImageUrl}) : null) ||
				fallbackImageUrl,
			icon: CARD_ICONS.chaptersExtras,
			sections: [
				...(chapters.length ? [{kind: 'chapters', title: $L('Chapters'), count: chapters.length, item}] : []),
				...groupExtrasByCategory(extras).map(({key, items}) =>
					mediaSection(getExtraCategoryLabel(key), items, 'landscape'))
			]
		};
	}

	similarCard() {
		const {similar = [], similarSource, seerr, serverUrl, fallbackImageUrl} = this.s;
		const recommendations = seerr?.recommendations || [];
		const seerrSimilar = seerr?.similar || [];
		if (!similar.length && !recommendations.length && !seerrSimilar.length) return null;

		// Named for where the list actually came from. The recommendation source preference only
		// applies to movies and series, and even then the loader falls back to the server's own
		// similar items when the chosen source has nothing, so the preference alone would
		// mislabel those.
		const librarySectionTitle = similarSource === 'moonfin' ? $L('Moonfin Recommends')
			: similarSource === 'tmdb' ? $L('TMDb')
				: $L('Similar');

		const total = similar.length + recommendations.length + seerrSimilar.length;
		return {
			id: 'similar',
			title: $L('Recommendations'),
			subtitle: countLabel(total, $L('1 title'), $L('{count} titles')),
			imageUrl: (similar.length
				? spotlightLandscapeImageUrl(serverUrl, similar[0], {fallbackUrl: fallbackImageUrl})
				: firstLandscapeImageUrl(serverUrl, recommendations.length ? recommendations : seerrSimilar)) || fallbackImageUrl,
			icon: CARD_ICONS.similar,
			sections: [
				// What Seerr knows about the title itself, ahead of the lists.
				...(seerr?.hasChips ? [{kind: 'seerrChips'}] : []),
				...(seerr?.hasFacts ? [{kind: 'seerrFacts'}] : []),
				...(similar.length ? [mediaSection(librarySectionTitle, similar)] : []),
				...(recommendations.length ? [seerrSection($L('Recommendations (Seerr)'), recommendations)] : []),
				...(seerrSimilar.length ? [seerrSection(similar.length ? $L('Similar (Seerr)') : $L('Similar'), seerrSimilar)] : [])
			]
		};
	}

	collectionsCard() {
		const {parentCollections = [], settings = {}, serverUrl, fallbackImageUrl} = this.s;
		if (!parentCollections.length) return null;
		const showMissing = settings.seerrShowMissingCollectionItems !== false;

		return {
			id: 'collections',
			title: $L('Collections'),
			subtitle: countLabel(parentCollections.length, $L('1 collection'), $L('{count} collections')),
			imageUrl: firstCollectionImageUrl(serverUrl, parentCollections) || fallbackImageUrl,
			icon: CARD_ICONS.collections,
			// The collection itself leads its own section, so there is a way into it.
			sections: parentCollections.map((collection) => mediaSection(collection.name, [
				collection.boxSetItem,
				...(showMissing
					? mergeMissingByReleaseOrder(collection.items || [], collection.missingItems || [])
					: (collection.items || []))
			].filter(Boolean)))
		};
	}

	seasonsCard() {
		const {seasons = [], item, seriesEpisodes = [], nextUp = [], serverUrl, fallbackImageUrl} = this.s;
		if (!seasons.length) return null;
		const episodeCount = seriesEpisodes.length || item?.RecursiveItemCount || 0;

		return {
			id: 'seasons',
			title: $L('Seasons and Episodes'),
			subtitle: joinSubtitle([
				countLabel(seasons.length, $L('1 season'), $L('{count} seasons')),
				episodeCount > 0 ? countLabel(episodeCount, $L('1 episode'), $L('{count} episodes')) : null
			]),
			imageUrl: firstPosterImageUrl(serverUrl, [...nextUp, ...seriesEpisodes]) || fallbackImageUrl,
			icon: CARD_ICONS.episodes,
			sections: [mediaSection($L('Seasons'), seasons)]
		};
	}

	episodesCard(title) {
		const {episodes = [], serverUrl, fallbackImageUrl} = this.s;
		if (!episodes.length) return null;
		return {
			id: 'episodes',
			title,
			subtitle: countLabel(episodes.length, $L('1 episode'), $L('{count} episodes')),
			imageUrl: firstPosterImageUrl(serverUrl, episodes) || fallbackImageUrl,
			icon: CARD_ICONS.episodes,
			sections: [mediaSection($L('Episodes'), episodes, 'landscape')]
		};
	}

	tracksCard() {
		const {albumTracks = [], item, serverUrl, fallbackImageUrl} = this.s;
		if (!albumTracks.length) return null;
		const totalTicks = albumTracks.reduce((sum, track) => sum + (track.RunTimeTicks || 0), 0);

		return {
			id: 'tracks',
			title: $L('Track List'),
			subtitle: joinSubtitle([
				countLabel(albumTracks.length, $L('1 track'), $L('{count} tracks')),
				totalTicks > 0 ? spotlightRuntimeLabel(totalTicks) : null
			]),
			imageUrl: spotlightItemImageUrl(serverUrl, item) || fallbackImageUrl,
			icon: CARD_ICONS.tracks,
			sections: [{
				kind: 'tracks',
				title: $L('Track List'),
				count: albumTracks.length,
				tracks: albumTracks,
				isAudiobook: item?.Type === 'AudioBook' || item?.Type === 'Book',
				groupByDisc: item?.Type === 'MusicAlbum'
			}]
		};
	}

	playlistCard() {
		const {playlistItems = [], canManagePlaylist, serverUrl, fallbackImageUrl} = this.s;
		if (!playlistItems.length) return null;
		return {
			id: 'playlist',
			title: $L('Playlist'),
			subtitle: countLabel(playlistItems.length, $L('1 item'), $L('{count} items')),
			imageUrl: spotlightItemImageUrl(serverUrl, playlistItems[0]) || fallbackImageUrl,
			icon: CARD_ICONS.playlist,
			sections: [{
				kind: 'tracks',
				title: $L('Playlist'),
				count: playlistItems.length,
				tracks: playlistItems,
				isPlaylist: true,
				showAlbum: true,
				manage: Boolean(canManagePlaylist)
			}]
		};
	}

	albumsCard() {
		const {artistAlbums = [], serverUrl, fallbackImageUrl} = this.s;
		if (!artistAlbums.length) return null;
		return {
			id: 'albums',
			title: $L('Albums'),
			subtitle: countLabel(artistAlbums.length, $L('1 album'), $L('{count} albums')),
			imageUrl: spotlightItemImageUrl(serverUrl, artistAlbums[0]) || fallbackImageUrl,
			icon: CARD_ICONS.tracks,
			sections: [mediaSection($L('Albums'), artistAlbums, 'square')]
		};
	}

	filmographyCard() {
		const {
			personMovies = [], personSeries = [], filmography = [],
			seerrAppearances = [], seerrCrewCredits = [], serverUrl, fallbackImageUrl
		} = this.s;
		const hasLibrary = personMovies.length > 0 || personSeries.length > 0;
		if (!hasLibrary && !filmography.length && !seerrAppearances.length && !seerrCrewCredits.length) return null;

		const subtitle = joinSubtitle([
			personMovies.length ? countLabel(personMovies.length, $L('1 movie'), $L('{count} movies')) : null,
			personSeries.length ? countLabel(personSeries.length, $L('1 show'), $L('{count} shows')) : null,
			!hasLibrary && filmography.length ? countLabel(filmography.length, $L('1 item'), $L('{count} items')) : null,
			!hasLibrary && !filmography.length && seerrAppearances.length
				? countLabel(seerrAppearances.length, $L('1 item'), $L('{count} items')) : null
		]);

		const lead = personMovies[0] || personSeries[0] || filmography[0] || null;
		return {
			id: 'filmography',
			title: $L('Filmography'),
			subtitle,
			imageUrl: (lead ? spotlightItemImageUrl(serverUrl, lead) : firstPosterImageUrl(serverUrl, seerrAppearances)) || fallbackImageUrl,
			icon: CARD_ICONS.filmography,
			sections: [
				...(personMovies.length ? [mediaSection($L('Movies'), personMovies)] : []),
				...(personSeries.length ? [mediaSection($L('TV Shows'), personSeries)] : []),
				...(seerrAppearances.length ? [seerrSection($L('Appearances (Seerr)'), seerrAppearances, true)] : []),
				...(seerrCrewCredits.length ? [seerrSection($L('Crew Contributions (Seerr)'), seerrCrewCredits, true)] : []),
				...(!hasLibrary && !seerrAppearances.length && !seerrCrewCredits.length && filmography.length
					? [mediaSection($L('Appearances'), filmography)] : [])
			]
		};
	}

	boxSetItemsCard() {
		const {collectionItems = [], missingCollectionItems = [], settings = {}, serverUrl, fallbackImageUrl} = this.s;
		const showMissing = settings.seerrShowMissingCollectionItems !== false;
		// Slotted in by release date, the same way the parent collection card orders its own
		// missing titles.
		const items = showMissing
			? mergeMissingByReleaseOrder(collectionItems, missingCollectionItems)
			: collectionItems;
		if (!items.length) return null;

		const movies = items.filter((i) => i.Type === 'Movie');
		const series = items.filter((i) => i.Type === 'Series');
		const rest = items.filter((i) => i.Type !== 'Movie' && i.Type !== 'Series');

		return {
			id: 'boxset_items',
			title: $L('Movies & Shows'),
			subtitle: joinSubtitle([
				movies.length ? countLabel(movies.length, $L('1 movie'), $L('{count} movies')) : null,
				series.length ? countLabel(series.length, $L('1 show'), $L('{count} shows')) : null,
				!movies.length && !series.length ? countLabel(items.length, $L('1 item'), $L('{count} items')) : null
			]),
			imageUrl: firstLandscapeImageUrl(serverUrl, items) || fallbackImageUrl,
			icon: CARD_ICONS.collections,
			sections: [
				...(movies.length ? [mediaSection($L('Movies'), movies)] : []),
				...(series.length ? [mediaSection($L('TV Shows'), series)] : []),
				...(rest.length ? [mediaSection($L('Movies & Shows'), rest)] : [])
			]
		};
	}

	boxSetPeopleCard() {
		const {collectionItems = [], studioCards = [], fallbackImageUrl} = this.s;
		// The people of every item in the collection, deduped by id, actors ahead of crew.
		const cast = new Map();
		const crew = new Map();
		collectionItems.forEach((child) => {
			(child.People || []).forEach((person) => {
				const key = person?.Id || person?.Name || '';
				if (!key) return;
				const bucket = person.Type === 'Actor' ? cast : crew;
				if (!bucket.has(key)) bucket.set(key, person);
			});
		});
		if (!cast.size && !crew.size && !studioCards.length) return null;

		const peopleCount = new Set([...cast.keys(), ...crew.keys()]).size;
		return {
			id: 'people',
			title: $L('Cast, Crew, and Studios'),
			subtitle: this.peopleSubtitle(peopleCount, studioCards.length),
			imageUrl: fallbackImageUrl,
			icon: CARD_ICONS.people,
			sections: [
				cast.size ? peopleSection($L('Cast'), [...cast.values()]) : null,
				crew.size ? peopleSection($L('Crew'), [...crew.values()]) : null,
				studioCards.length ? this.studiosSection() : null
			].filter(Boolean)
		};
	}

	playlistOrderCard() {
		const {playlistItems = [], serverUrl, fallbackImageUrl} = this.s;
		if (!playlistItems.length) return null;
		return {
			id: 'playlist_order',
			title: $L('Playlist Order'),
			subtitle: countLabel(playlistItems.length, $L('1 item'), $L('{count} items')),
			imageUrl: spotlightLandscapeImageUrl(serverUrl, playlistItems[0], {fallbackUrl: fallbackImageUrl}),
			icon: CARD_ICONS.playlist,
			sections: [{
				kind: 'tracks',
				title: $L('Playlist Order'),
				count: playlistItems.length,
				tracks: playlistItems,
				showAlbum: true
			}]
		};
	}
}

// The cards for an item, in order, with the ones that would show nothing left out.
export const spotlightCardsFor = (state) => new CardBuilder(state).build();

// One card by id, so an open modal can refresh what it is showing without rebuilding every
// other card to find it.
export const spotlightCardFor = (id, state) => new CardBuilder(state).buildOne(id);
