import { createMemo, createSignal } from 'solid-js'
import CoreDialog from '../shell/CoreDialog.jsx'
import { coreFrame, dp } from '../shell/coreFrame.js'
import { layoutBlocks } from '../shell/MessageMarkdown.js'
import { theme } from '../../theme.js'
import { parseMarkdown } from '../../../utils/markdown.js'
import { reviewMeta } from '../../../utils/tmdbReviews.js'
import { Rects, Texts } from './draw.jsx'

// A review in full in a wide CoreDialog, under the reviewer's name, score and date. Up and Down page
// through it by 80% of what shows. A TV has nowhere to open the TMDB link, so it's left off.
// Props: `review`. Back calls onReviewClose().
const PAD_TOP = dp(8)
const PAD_X = dp(24)
const PAD_BOTTOM = dp(16)
const SLIDE = { y: { duration: 180, easing: 'ease' } }

export default function ReviewDialog(props) {
  const [scroll, setScroll] = createSignal(0)
  const title = () => (props.review && props.review.author) || ''
  const subtitle = () => (props.review ? reviewMeta(props.review) : '')
  const body = createMemo(() => layoutBlocks(parseMarkdown((props.review && props.review.content) || ''), dp(720) - 2 - 2 * PAD_X, theme(), '#00a4dcff'))
  const fullH = () => PAD_TOP + body().h + PAD_BOTTOM
  const frame = createMemo(() => coreFrame({ title: title(), subtitle: subtitle(), wide: true, bodyH: fullH() }))
  const page = (d) => {
    const viewH = frame().bodyH
    setScroll(Math.max(0, Math.min(fullH() - viewH, scroll() + d * viewH * 0.8)))
    return true
  }
  return (
    <view
      ref={props.ref}
      width={1920}
      height={1080}
      onUp={() => page(-1)}
      onDown={() => page(1)}
      onBack={() => {
        if (props.onReviewClose) props.onReviewClose()
        return true
      }}
      onKeyPress={() => true}
    >
      <CoreDialog title={title()} subtitle={subtitle()} wide bodyH={fullH()} />
      <view x={frame().bodyX} y={frame().bodyY} width={frame().bodyW} height={frame().bodyH} clipping>
        <view x={PAD_X} y={PAD_TOP - scroll()} width={frame().bodyW - 2 * PAD_X} height={body().h} transition={SLIDE}>
          <Rects list={body().rects} />
          <Texts list={body().texts} />
        </view>
      </view>
    </view>
  )
}
