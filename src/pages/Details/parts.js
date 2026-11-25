// The Details Screen Styles that draw in a component of their own, by their setting value (v1
// Classic, v3 Spotlight, v4 Nouveau, v5 Minimalist, v6 Stage, v7 Premiere, v8 Quick Look, v9 Frost),
// and DetailModals. Modern (v2) draws in Details.jsx itself, and a value with no entry here falls
// back to it.
// A style gets `page` (the page's handle), `tokens` and `quickLook`, and hands back
// { paint(bag), setFocus(), skeletonBoxes() } through `ref`. paint() runs on every load step, and
// the style draws its own backdrop from bag.backdropUrl.
import Spotlight from './spotlight/Spotlight.jsx'
import Frost from './frost/Frost.jsx'
import Nouveau from './nouveau/Nouveau.jsx'
import Classic from './classic/Classic.jsx'
import Minimalist from './minimalist/Minimalist.jsx'
import Premiere from './premiere/Premiere.jsx'
import QuickLook from './quickLook/QuickLook.jsx'
import Stage from './stage/Stage.jsx'
import DetailModals from '../../ui/components/modals/DetailModals.jsx'

export const STYLES = {
  v1: Classic,
  v3: Spotlight,
  v4: Nouveau,
  v5: Minimalist,
  v6: Stage,
  v7: Premiere,
  v8: QuickLook,
  v9: Frost,
}
export const MODALS = DetailModals
