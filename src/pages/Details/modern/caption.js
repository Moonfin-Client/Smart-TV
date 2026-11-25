// A media card's caption under the art: 10px above and below a 33px title line, and a second
// 33px line for an episode's or season's code, an album's or track's artist or a subtitle, 4px
// further down under a series name. A row of the grid is as tall as its tallest card.
export const captionHeight = (it) => {
  const episodeInfo = (it.Type === 'Episode' && it.ParentIndexNumber !== undefined) || (it.Type === 'Season' && it.SeriesName)
  const musicInfo = (it.Type === 'MusicAlbum' && (it.AlbumArtist || (it.AlbumArtists && it.AlbumArtists[0] && it.AlbumArtists[0].Name))) || (it.Type === 'Audio' && (it.AlbumArtist || (it.Artists && it.Artists[0])))
  const second = episodeInfo || musicInfo || it.Subtitle
  return 10 + 33 + (second ? (episodeInfo ? 4 : 0) + 33 : 0) + 10
}
