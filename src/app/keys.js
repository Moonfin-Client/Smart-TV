// The remote's keys by handler name. The focused element, or any element above it, handles a key
// with on<Name>, like onBack or onPlayPause. Chrome 38 has no KeyboardEvent.key, so every key is
// listed by its code.
export const KEY_MAP = {
  Left: 37,
  Up: 38,
  Right: 39,
  Down: 40,
  Enter: 13,
  // webOS, Tizen, a keyboard's Escape and Backspace.
  Back: [461, 10009, 27, 8, 'Escape'],
  // webOS and Tizen first, then the codes the Xbox host and the Vega shell raise for their remotes
  // and the Xbox triggers (utils/keys.js XBOX_KEYS and VEGA_KEYS).
  Play: [415, 250],
  Pause: 19,
  PlayPause: [10252, 179],
  Stop: [413, 178],
  Rewind: [412, 227],
  FastForward: [417, 228],
  Red: 403,
  Green: 404,
  Yellow: 405,
  Blue: 406,
  Info: 457,
  Delete: 46,
  ChannelUp: [33, 427],
  ChannelDown: [34, 428],
  // The context menu key, which the Xbox controller's Menu button and the Vega remote's menu key
  // arrive as (platform/xbox/keys.js, platform/vega/video.js). It opens the focused card's menu.
  Menu: [93, 'ContextMenu'],
}
