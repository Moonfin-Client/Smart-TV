// Stands in for the screens the Roku build leaves out (readers, games and After Hours).
export default function NotOnRoku() {
  return (
    <view width={1920} height={1080} color={0x0a0a12ff}>
      <text x={960} y={500} mountX={0.5} fontSize={40} fontFamily="roboto-medium">
        Not available on Roku
      </text>
    </view>
  )
}

export const pressVersion = () => {}
