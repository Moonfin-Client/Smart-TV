import { For, createEffect, createSignal, on } from 'solid-js'
import { uiFont, fontFor, faceDy, themeSpacing } from '../../text.js'
import { theme, glowShadow } from '../../theme.js'
import { COLUMN_H, atlasColumn, atlasLinkScroll } from './atlasColumn.js'

const SHADOW = glowShadow({ color: '#0000008c', x: 0, y: 45, blur: 90, spread: 0 }).shadow

// The panel the Atlas bar drops under a tab, laid out by atlasTiles. It's purely visual: Atlas owns
// the keys and passes `zone` ('links' or 'tiles'), `linkCur` and `cur`.
export default function AtlasPanel(props) {
  const linkOn = (i) => props.zone === 'links' && props.linkCur === i
  const tileOn = (i) => props.zone === 'tiles' && props.cur === i
  const dividers = () => (props.titles || []).filter((x) => x.divider)
  const headings = () => (props.titles || []).filter((x) => !x.divider)
  const count = () => (props.links || []).length
  const column = () => atlasColumn(count())
  const [scroll, setScroll] = createSignal(0)
  // A panel opening on another tab starts at the top.
  createEffect(
    on(
      () => props.links,
      () => setScroll(0),
      { defer: true },
    ),
  )
  createEffect(
    on(
      () => props.linkCur,
      (i) => setScroll(atlasLinkScroll(i, scroll(), count())),
      { defer: true },
    ),
  )
  return (
    <view>
      <view y={96} width={1920} height={984} color="#0000008c" />
      <view x={60} y={96} width={1800} height={495} borderRadius={[0, 0, 27, 27]} color="#00000000" shadow={SHADOW} />
      <view x={60} y={96} width={1800} height={495} borderRadius={[0, 0, 27, 27]} color="#1b1f26ff" />
      <view x={108} y={138} width={330} height={COLUMN_H} clipping>
        <view y={-scroll()} width={330} height={COLUMN_H + column().maxScroll}>
          <view width={330} height={column().titleH} clipping>
            <text
              fontFamily={uiFont('bold')}
              fontSize={18}
              y={1.5 + faceDy(18)}
              lineHeight={33}
              letterSpacing={2.16}
              maxWidth={330}
              maxLines={1}
              color="#ffffff8c"
            >
              {(props.title || '').toUpperCase()}
            </text>
          </view>
          <For each={props.links || []}>
            {(lk, i) => (
              <view y={column().top + i() * 66} width={330} height={60}>
                <view width={330} height={60} borderRadius={30} color="#ffffffff" alpha={linkOn(i()) ? 1 : 0} />
                <text
                  letterSpacing={themeSpacing()}
                  fontFamily={fontFor(lk.label, linkOn(i()) ? 'bold' : 'medium')}
                  fontSize={22}
                  x={24}
                  y={21 + faceDy(22, true)}
                  lineHeight={1}
                  maxWidth={234}
                  maxLines={1}
                  color={linkOn(i()) ? '#101010ff' : '#ffffffd1'}
                >
                  {lk.label}
                </text>
                <view
                  x={282}
                  y={18}
                  width={24}
                  height={24}
                  src="icons/nav_chevron_right.webp"
                  color="#101010ff"
                  alpha={linkOn(i()) ? 1 : 0}
                />
              </view>
            )}
          </For>
        </view>
      </view>
      <view>
        <For each={dividers()}>{(d) => <view x={d.x} y={138} width={1} height={411} color="#ffffff14" />}</For>
      </view>
      <view>
        <For each={headings()}>
          {(h) => (
            <text
              letterSpacing={themeSpacing()}
              fontFamily={h.font}
              fontSize={22}
              x={h.x}
              y={140 + faceDy(22)}
              lineHeight={33}
              maxWidth={700}
              maxLines={1}
              color="#ffffffff"
            >
              {h.text}
            </text>
          )}
        </For>
      </view>
      <view>
        <For each={props.tiles || []}>
          {(c, i) => (
            <view x={c.x} y={189}>
              <view
                x={-4}
                y={-4}
                width={c.w + 8}
                height={c.h + 8}
                borderRadius={c.radius + 4}
                color="#ffffffff"
                alpha={tileOn(i()) ? 1 : 0}
              />
              <view width={c.w} height={c.h} borderRadius={c.radius} color="#1a1a1aff" />
              <view
                width={c.w}
                height={c.h}
                borderRadius={c.radius}
                src={c.url || undefined}
                textureOptions={{ resizeMode: { type: 'cover' } }}
                alpha={c.url ? 1 : 0}
              />
              <text
                letterSpacing={themeSpacing()}
                fontFamily={c.nameFont}
                fontSize={20}
                x={c.w / 2}
                y={c.h / 2 - 12}
                mountX={0.5}
                maxWidth={c.w - 24}
                maxLines={2}
                textAlign="center"
                contain="width"
                color="#ffffffff"
              >
                {c.url ? '' : c.name}
              </text>
              <view y={162} width={c.progress ? 300 : 0} height={6} color="#ffffff2e" />
              <view y={162} width={c.progress} height={6} color={theme().accent} />
              <text
                letterSpacing={themeSpacing()}
                fontFamily={c.titleFont}
                fontSize={21}
                y={177 + faceDy(21)}
                lineHeight={33}
                maxWidth={300}
                maxLines={1}
                color="#ffffffff"
              >
                {c.title}
              </text>
              <text
                letterSpacing={themeSpacing()}
                fontFamily={c.subFont}
                fontSize={18}
                y={206.5 + faceDy(18)}
                lineHeight={33}
                maxWidth={300}
                maxLines={1}
                color="#ffffff99"
              >
                {c.sub}
              </text>
            </view>
          )}
        </For>
      </view>
    </view>
  )
}
