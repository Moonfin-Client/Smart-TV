import FeaturedBar from './FeaturedBar.jsx'
import MakdBar from './MakdBar.jsx'
import AyaBar from './AyaBar.jsx'
import GalleryBar from './GalleryBar.jsx'
import BannerBar from './BannerBar.jsx'
import BookshelfBar from './BookshelfBar.jsx'

// The bar for each featuredBarStyle, for Home to mount with <Dynamic>. A bar gets `items`, `rowPeek`,
// `alpha` and `ref`, and calls Home's onBarSlide, onBarInfo, onBarPlay and onBarTrailer. A bar that
// plays trailers puts its trailer host on the ref'd node as `trailer`. 'off' has no bar, and anything
// unknown gets the default Moonfin bar.
const BARS = { moonfin: FeaturedBar, makd: MakdBar, aya: AyaBar, gallery: GalleryBar, banner: BannerBar, bookshelf: BookshelfBar }

export const barComponent = (style) => (style === 'off' ? null : BARS[style] || FeaturedBar)
