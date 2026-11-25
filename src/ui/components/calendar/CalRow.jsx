import { For } from 'solid-js'

const COVER = { resizeMode: { type: 'cover' } }

// One agenda row, purely visual. The list that holds it draws the focus ring, so moving focus never
// redraws a row. The model `r` comes from agendaRowModel, placed at `y`.
export default function CalRow(props) {
  const r = () => props.r
  return (
    <view y={props.y || 0} width={r().w} height={r().h}>
      <text fontFamily={r().timeFont} fontSize={21.7} x={r().timeX} y={r().timeY} lineHeight={r().timeLh} letterSpacing={0.42} color="#ffffffb3">
        {r().time}
      </text>
      <view x={r().barX} y={r().barY} width={5.01} height={r().barH} borderRadius={3.34} color={r().bar} />
      <view x={r().thumbX} y={r().barY} width={r().artW} height={r().artH} borderRadius={13.36} color="#ffffff0f">
        <view x={r().artW / 2 - 20} y={r().artH / 2 - 20} width={40} height={40} src={r().icon} color="#ffffff4d" />
        <view width={r().artW} height={r().artH} borderRadius={13.36} src={r().src || ''} textureOptions={COVER} alpha={r().src ? 1 : 0} />
      </view>
      <text fontFamily={r().titleFont} fontSize={25.04} x={r().textX} y={r().titleY} letterSpacing={0.42} color="#ffffff">
        {r().title}
      </text>
      <text fontFamily={r().subFont} fontSize={21.7} x={r().textX} y={r().subY} letterSpacing={0.42} color="#ffffffa6">
        {r().subtitle}
      </text>
      <view>
        <For each={r().tags}>
          {(t) => (
            <view x={r().textX + t.x} y={t.y} width={t.w} height={t.h} borderRadius={10.02} color={t.fill}>
              <text fontFamily={t.font} fontSize={18.37} x={11.69} y={t.ty} letterSpacing={0.33} color={t.color}>
                {t.label}
              </text>
            </view>
          )}
        </For>
      </view>
    </view>
  )
}
