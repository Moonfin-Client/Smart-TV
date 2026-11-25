// The calendar's pill button and tab chip: a fill inside a 1 dp border that stays clear until focus
// fills it white with the focus color as its edge. The box comes from pillBox and the colors from
// the view, which places it with `x` and `y`.
export default function CalPill(props) {
  const p = () => props.p
  return (
    <view x={props.x || 0} y={props.y || 0} width={p().w} height={p().h} alpha={p().dim ? 0.35 : 1} onPointerOver={props.onPointerOver} onPointerClick={props.onPointerClick}>
      <view width={p().w} height={p().h} borderRadius={p().radius} color={props.ring} alpha={props.focused ? 1 : 0} />
      <view
        x={p().border}
        y={p().border}
        width={p().w - p().border * 2}
        height={p().h - p().border * 2}
        borderRadius={p().radius - p().border}
        color={props.focused ? props.fill : p().bg}
      />
      <view
        x={p().iconX}
        y={p().iconY}
        width={p().iconSize}
        height={p().iconSize}
        src={p().src || ''}
        color={props.focused ? props.ink : p().fg}
        alpha={p().iconSize ? 1 : 0}
      />
      <text
        fontFamily={p().font}
        fontSize={p().size}
        x={p().textX}
        y={p().textY}
        letterSpacing={p().ls}
        color={props.focused ? props.ink : p().fg}
      >
        {p().label}
      </text>
    </view>
  )
}
