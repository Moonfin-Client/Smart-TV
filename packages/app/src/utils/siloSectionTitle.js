import $L from '@enact/i18n/$L';

// Silo's own home rows in the app's language. Silo sends title_key (and title_args) with a section
// while its title is the server's own, so a row the viewer renamed keeps the name it was given.
// Each key maps to its string and, for one with a placeholder, the title_args value that fills it.
const SECTION_TITLES = {
	'home.section.becauseYouEnjoy': [() => $L('Because you enjoy {genres}'), 'genres'],
	'home.section.becauseYouWatched': [() => $L('Because You Watched')],
	'home.section.becauseYouWatchedTitle': [() => $L('Because You Watched {title}'), 'title'],
	'home.section.continueListening': [() => $L('Continue Listening')],
	'home.section.continueReading': [() => $L('Continue Reading')],
	'home.section.continueWatching': [() => $L('Continue Watching')],
	'home.section.forYou': [() => $L('For You')],
	'home.section.hiddenGems': [() => $L('Hidden Gems')],
	'home.section.highlyRatedInLibrary': [() => $L('Highly Rated in Your Library')],
	'home.section.nextInYourSeries': [() => $L('Next in Your Series')],
	'home.section.nextUp': [() => $L('Next Up')],
	'home.section.pickedFromYourHistory': [() => $L('Picked from your history')],
	'home.section.popularOnServer': [() => $L('Popular on This Server')],
	'home.section.profilesLikeYouEnjoyed': [() => $L('Profiles Like You Enjoyed')],
	'home.section.randomPicks': [() => $L('Random Picks')],
	'home.section.recentlyAdded': [() => $L('Recently Added')],
	'home.section.recentlyAddedAudiobooks': [() => $L('Recently Added Audiobooks')],
	'home.section.recentlyAddedEbooks': [() => $L('Recently Added Ebooks')],
	'home.section.recentlyAddedIn': [() => $L('Recently Added in {library}'), 'library'],
	'home.section.recentlyAddedManga': [() => $L('Recently Added Manga')],
	'home.section.recentlyAddedMovies': [() => $L('Recently Added Movies')],
	'home.section.recentlyAddedTv': [() => $L('Recently Added TV')],
	'home.section.recentlyReleased': [() => $L('Recently Released')],
	'home.section.recentlyReleasedAudiobooks': [() => $L('Recently Released Audiobooks')],
	'home.section.recentlyReleasedEbooks': [() => $L('Recently Released Ebooks')],
	'home.section.recentlyReleasedEpisodes': [() => $L('Recently Released Episodes')],
	'home.section.recentlyReleasedEpisodesIn': [() => $L('Recently Released Episodes in {library}'), 'library'],
	'home.section.recentlyReleasedIn': [() => $L('Recently Released in {library}'), 'library'],
	'home.section.recentlyReleasedManga': [() => $L('Recently Released Manga')],
	'home.section.recentlyReleasedMovies': [() => $L('Recently Released Movies')],
	'home.section.recommendedForYou': [() => $L('Recommended for You')],
	'home.section.returningShows': [() => $L('Returning Shows')],
	'home.section.seasonal.christmas.classics': [() => $L('Christmas Classics')],
	'home.section.seasonal.christmas.comedies': [() => $L('Christmas Comedies')],
	'home.section.seasonal.christmas.family': [() => $L('Family Christmas')],
	'home.section.seasonal.christmas.favorites': [() => $L('Christmas Favorites')],
	'home.section.seasonal.christmas.hallmark': [() => $L('Hallmark Christmas')],
	'home.section.seasonal.christmas.romcoms': [() => $L('Christmas Rom-Coms')],
	'home.section.seasonal.easter.faith': [() => $L('Easter Stories')],
	'home.section.seasonal.easter.family': [() => $L('Easter Movies')],
	'home.section.seasonal.familyMovieNight.favorites': [() => $L('Family Favorites')],
	'home.section.seasonal.familyMovieNight.liveAction': [() => $L('Family Movie Night')],
	'home.section.seasonal.familyMovieNight.new': [() => $L('Family Movie Night')],
	'home.section.seasonal.halloween.animated': [() => $L('Animated Halloween')],
	'home.section.seasonal.halloween.family': [() => $L('Family Halloween')],
	'home.section.seasonal.halloween.favorites': [() => $L('Halloween Favorites')],
	'home.section.seasonal.halloween.horror': [() => $L('Halloween Horror')],
	'home.section.seasonal.halloween.tv': [() => $L('Halloween TV')],
	'home.section.seasonal.newYear.favorites': [() => $L('New Year\'s Movies')],
	'home.section.seasonal.saturdayMorning.cartoons': [() => $L('Saturday Morning Cartoons')],
	'home.section.seasonal.saturdayMorning.modern': [() => $L('Saturday Morning Favorites')],
	'home.section.seasonal.saturdayMorning.nineties': [() => $L('90s Saturday Mornings')],
	'home.section.seasonal.stPatricks.irishFilm': [() => $L('Irish Film')],
	'home.section.seasonal.stPatricks.irishTv': [() => $L('Irish TV')],
	'home.section.seasonal.summer.blockbusters': [() => $L('Summer Blockbusters')],
	'home.section.seasonal.summer.classicSummer': [() => $L('Classic Summer Movies')],
	'home.section.seasonal.summer.nostalgia': [() => $L('Summer Nostalgia')],
	'home.section.seasonal.summerBlockbuster.blockbusters': [() => $L('Summer Blockbusters')],
	'home.section.seasonal.summerBlockbuster.classicSummer': [() => $L('Classic Summer Movies')],
	'home.section.seasonal.summerBlockbuster.nostalgia': [() => $L('Summer Nostalgia')],
	'home.section.seasonal.thanksgiving.favorites': [() => $L('Thanksgiving Movies')],
	'home.section.seasonal.thanksgiving.feelGood': [() => $L('Feel-Good Favorites')],
	'home.section.seasonal.valentines.favorites': [() => $L('Valentine\'s Favorites')],
	'home.section.seasonal.valentines.loveStories': [() => $L('Classic Love Stories')],
	'home.section.seasonal.valentines.romanticDramas': [() => $L('Romantic Dramas')],
	'home.section.seasonal.valentines.romcoms': [() => $L('Valentine\'s Rom-Coms')],
	'home.section.seasonalPicks': [() => $L('Seasonal Picks')],
	'home.section.topGenre': [() => $L('Top {genre}'), 'genre'],
	'home.section.topPicksToday': [() => $L('Top Picks Today')],
	'home.section.topRated': [() => $L('Top Rated')],
	'home.section.topRatedMovies': [() => $L('Top Rated Movies')],
	'home.section.topRatedTv': [() => $L('Top Rated TV')],
	'home.section.trendingOnServer': [() => $L('Trending on Server')],
	'home.section.trendingThisWeek': [() => $L('Trending This Week')]
};

// A section's title in the app's language, or Silo's own title for a renamed row, a key this app
// doesn't know, or a key without the value its placeholder needs.
export const siloSectionTitle = ({title, titleKey, titleArgs}) => {
	const entry = titleKey && Object.prototype.hasOwnProperty.call(SECTION_TITLES, titleKey) ? SECTION_TITLES[titleKey] : null;
	if (!entry) return title;
	const [text, arg] = entry;
	if (!arg) return text();
	const value = titleArgs?.[arg];
	return typeof value === 'string' ? text().replace(`{${arg}}`, value) : title;
};
