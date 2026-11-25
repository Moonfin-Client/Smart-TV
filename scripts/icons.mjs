// Renders the app's icons to 64 px white WebP images in public/icons. The renderer tints a white
// texture by the node color, and WebP is the one format every TV's image path decodes (SVG
// needs createImageBitmap in a worker or a working ImageData, which Chrome 38 lacks).
// Paths come from scripts/iconPaths.mjs and the icon maps in src, plus a few standard Material glyphs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  BOOK, CALENDAR, DETAIL, GAME, GUIDE, INCOMPLETE_BADGE, MATERIAL, MATERIAL_SYMBOLS, MUSIC, MUSIC_CHIPS, MUSIC_HEART_OUTLINE, NAV,
  PLAYER, PLAYER_GLYPHS, RECORD_PROMPT, RECORDINGS, SEERR_SVG,
} from './iconPaths.mjs'

const srcText = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
const coreText = srcText('views/Settings/settingsCoreIcons.js')
const homeText = srcText('components/icons/homeIconPaths.js')
const entriesIn = (text) => [...text.matchAll(/^\s+([a-zA-Z_0-9]+):\s*'(M[^']+)'/gm)].map((m) => [m[1], m[2]])
const core = Object.fromEntries(entriesIn(coreText))

const paths = {}
for (const [name, d] of [...entriesIn(coreText), ...Object.entries(MATERIAL), ...entriesIn(homeText)]) {
  if (!paths[name]) paths[name] = d
}

// Standard Material Icons glyphs (24 grid) the maps above don't carry.
Object.assign(paths, {
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  arrow_back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  backspace:
    'M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z',
  space_bar: 'M18 9v4H6V9H4v6h16V9z',
  arrow_upward: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
  skip_previous: 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
  skip_next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
  logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  volume_up:
    'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  expand_more: 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z',
  chevron_right: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  chevron_left: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
  sort: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z',
  filter_list: 'M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z',
  folder: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  closed_caption:
    'M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z',
  qr_code_2: 'M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zm0 10h2v2h-2zm-6-6h2v2h-2zm2 2h2v2h-2zm-2 2h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2zm0-4h2v2h-2zm2 2h2v2h-2z',
  dns: 'M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  history: 'M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  hd: 'M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 12H9.5v-2h-2v2H6V9h1.5v2.5h2V9H11v6zm2-6h4c.55 0 1 .45 1 1v4c0 .55-.45 1-1 1h-4V9zm1.5 4.5h2v-3h-2v3z',
  // The track picker's indicators, the episode browser's placeholder and its watched check.
  track_selected: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m-1.4 14.6L6.4 12.4l1.4-1.4 2.8 2.8 5.6-5.6 1.4 1.4z',
  track_unselected: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16m0-2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  episode_placeholder: 'M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 7.5l7 4.5-7 4.5z',
  watched_check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
})

// The player's Material Symbols, on a 960 grid.
const SYMBOLS = {
  player_episodes: 'm424-373 260-167-260-167v334ZM260-200q-24 0-42-18t-18-42v-560q0-24 18-42t42-18h560q24 0 42 18t18 42v560q0 24-18 42t-42 18H260Zm0-60h560v-560H260v560ZM140-80q-24 0-42-18t-18-42v-620h60v620h620v60H140Zm120-740v560-560Z',
  player_sleep: 'M524-124q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T164-484q0-128 78.5-225T446-833q13-3 24 .5t18 10.5q7 7 10 18t0 24q-5 17-7.5 35t-2.5 37q0 108 76 184t184 76q19 0 37.5-2.5T821-459q13-3 23.5.5T862-448q7 7 10.5 17.5T876-407q-27 122-124 202.5T524-124Zm0-60q88 0 158-48.5T786-358q-16 3-32 4.5t-31 1.5q-133 0-226.5-93.5T403-672q0-15 1.5-31t4.5-32q-77 34-125.5 104T235-473q0 120 84.5 204.5T524-184Zm-16-290Z',
}
Object.assign(paths, SYMBOLS)

const WANTED = [
  'home', 'search', 'movie', 'tv', 'live_tv', 'music_note', 'favorite', 'favorite_border', 'settings', 'person',
  'play_arrow', 'pause', 'info', 'fast_forward', 'fast_rewind', 'skip_next', 'skip_previous', 'subtitles',
  'closed_caption', 'audiotrack', 'check', 'check_circle', 'star', 'shuffle', 'arrow_back', 'close', 'more_horiz',
  'add', 'calendar_month', 'replay', 'speed_rounded', 'video_library', 'visibility', 'logout', 'tune', 'refresh',
  'delete', 'language', 'backspace', 'space_bar', 'arrow_upward', 'volume_up', 'list', 'expand_more',
  'chevron_right', 'chevron_left', 'sort', 'filter_list', 'folder', 'grid_view', 'playlist_play',
  'collections_bookmark', 'photo_library_rounded', 'menu_book_rounded', 'qr_code_2', 'dns', 'history', 'hd',
  'track_selected', 'track_unselected', 'episode_placeholder', 'watched_check', 'player_episodes', 'player_sleep',
]

// Search and Seerr: the status dots, the Discover tiles and pills, and Search's microphone.
paths.mic = 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z'
WANTED.push('checkRounded', 'removeRounded', 'scheduleRounded', 'playlistAddCheck', 'moveToInboxOutlined', 'report_problem_outlined', 'mic')
// The Seerr request, manage and report dialogs.
WANTED.push('arrowDropDown', 'checkCircle', 'radioUnchecked', 'radioChecked', 'checkCircleOutline', 'cancelOutlined', 'autorenew', 'toggleOn', 'toggleOff', 'checkBox', 'checkBoxBlank', 'expandMore', 'expandLess', 'block', 'dataUsage')
// The Seerr requests tiles' round actions and the arr's Not found yet.
Object.assign(paths, {
  req_approve: 'M16.59 7.58L10 14.17l-3.59-3.58L5 12l5 5 8-8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z',
  req_decline: 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.59-13L12 10.59 8.41 7 7 8.41 10.59 12 7 15.59 8.41 17 12 13.41 15.59 17 17 15.59 13.41 12 17 8.41z',
  req_retry: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  search_off: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3 6.08 3 3.28 5.64 3.03 9h2.02C5.3 6.75 7.18 5 9.5 5 11.99 5 14 7.01 14 9.5S11.99 14 9.5 14c-.17 0-.33-.03-.5-.05v2.02c.17.02.33.03.5.03 1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM6.47 10.82 4 13.29l-2.47-2.47-.71.71L3.29 14 .82 16.47l.71.71L4 14.71l2.47 2.47.71-.71L4.71 14l2.47-2.47z',
})
WANTED.push('req_approve', 'req_decline', 'req_retry', 'search_off')
// Seerr Browse's sort and filter panel, and the collection request sheet.
WANTED.push('expandMore', 'expandLess', 'arrowUpward', 'arrowDownward', 'filterAltOff', 'checkBox', 'checkBoxBlank', 'toggleOn', 'toggleOff', 'block', 'dataUsage')

// Live TV, Recordings, the Record prompt and Calendar glyphs, renamed here.
const pick = (map, names) => {
  for (const [key, name] of Object.entries(names)) {
    if (map[key]) paths[name] = map[key]
    WANTED.push(name)
  }
}
pick(GUIDE, { calendar: 'guide_event', dvr: 'dvr', tv: 'guide_tv', record: 'rec_dot', seriesRecord: 'series_record', continuesFrom: 'continues_from' })
pick(RECORDINGS, { smartRecord: 'smart_record' })
pick(RECORD_PROMPT, { warning: 'prompt_warning', compare: 'prompt_compare', check: 'prompt_check', scheduled: 'prompt_scheduled' })
pick(CALENDAR, Object.fromEntries([
  'play_arrow_rounded', 'add_rounded', 'today_rounded', 'chevron_left_rounded', 'chevron_right_rounded',
  'event_busy_rounded', 'event_available_rounded', 'refresh_rounded',
].map((n) => [n, n])))
WANTED.push('calendar_month_rounded', 'tv_rounded', 'info_outline_rounded', 'movie_outlined', 'playCircleFill')
// The MakD media bar's Details button.
WANTED.push('infoOutline')
// The photo viewer's 18 by 22 play triangle and the accent quarter of its 48 px loading ring.
paths.pv_play = 'M3 1V23L21 12Z'
paths.pv_spinner_arc = 'M3.515 3.515A12 12 0 0 1 20.485 3.515L19.425 4.575A10.5 10.5 0 0 0 4.575 4.575Z'
WANTED.push('pv_play', 'pv_spinner_arc')
// The book library's glyphs and the core icons its screens draw, prefixed so they keep their own paths.
pick(BOOK, Object.fromEntries([
  'auto_stories_outlined', 'auto_stories_rounded', 'library_books_outlined', 'menu_book', 'menu_book_rounded',
  'headphones_rounded', 'layers_outlined', 'person_outline_rounded', 'sell_outlined', 'collections_bookmark_outlined',
  'favorite_border_rounded', 'search_rounded', 'play_arrow_rounded', 'play_arrow', 'chevron_right_rounded',
  'check_rounded', 'explore_outlined', 'casino_rounded', 'folder_outlined', 'favorite_rounded',
].map((n) => [n, `book_${n}`])))
pick(core, { info_outline: 'core_info_outline', edit: 'core_edit', arrow_left: 'core_arrow_left', shuffle: 'core_shuffle', filter_list: 'core_filter_list', space_dashboard_outlined: 'core_space_dashboard_outlined', format_textdirection_l_to_r: 'core_format_textdirection_l_to_r', format_textdirection_r_to_l: 'core_format_textdirection_r_to_l', invert_colors: 'core_invert_colors', visibility: 'core_visibility', visibility_off: 'core_visibility_off' })

// The game screens' Material Symbols, as game_<name>.
for (const [name, d] of Object.entries(GAME)) SYMBOLS[`game_${name}`] = d
Object.assign(SYMBOLS, {
  game_back: 'M313-440l224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z',
  game_search: 'M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z',
  game_players: 'M0-240v-63q0-43 44-70t116-27q13 0 25 .5t23 2.5q-14 21-21 44t-7 48v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-26-6.5-49T754-397q11-2 22.5-2.5t23.5-.5q72 0 116 26.5t44 70.5v63H780ZM160-440q-33 0-56.5-23.5T80-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T160-440Zm640 0q-33 0-56.5-23.5T720-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T800-440Zm-320-40q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q51 0 85.5 34.5T600-600q0 50-34.5 85T480-480Z',
  game_rating: 'm354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z',
  game_system: 'M182-200q-51 0-79-35.5T82-322l54-356q9-56 51-89t99-33h388q57 0 99 33t51 89l54 356q7 51-21 86.5T878-200q-21 0-39-7.5T806-230L692-344H268L154-230q-15 15-33 22.5t-39 7.5Zm596-160q17 0 29.5-12.5T820-402q0-17-12.5-29.5T778-444q-17 0-29.5 12.5T736-402q0 17 12.5 29.5T778-360ZM698-500q17 0 29.5-12.5T740-542q0-17-12.5-29.5T698-584q-17 0-29.5 12.5T656-542q0 17 12.5 29.5T698-500ZM324-450q13 0 21.5-8.5T354-480v-40h40q13 0 21.5-8.5T424-550q0-13-8.5-21.5T394-580h-40v-40q0-13-8.5-21.5T324-650q-13 0-21.5 8.5T294-620v40h-40q-13 0-21.5 8.5T224-550q0 13 8.5 21.5T254-520h40v40q0 13 8.5 21.5T324-450Z',
  game_chevron: 'M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z',
  game_play: 'M320-200v-560l440 280-440 280Z',
})
Object.assign(paths, SYMBOLS)
paths.game_glyph = 'M7 8a5 5 0 0 0 0 10 5 5 0 0 0 3.9-1.9h2.2A5 5 0 0 0 17 18a5 5 0 0 0 0-10Zm-.5 3h1v1.5H9v1H7.5V15h-1v-1.5H5v-1h1.5Zm9 .5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-1.5 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z'
WANTED.push(...Object.keys(SYMBOLS).filter((n) => n.startsWith('game_')), 'game_glyph')

// The library screens' glyphs, as lib_<name>.
Object.assign(paths, {
  lib_search: 'M15.52 14.02H14.72L14.44 13.73C15.42 12.61 15.98 11.11 15.98 9.52C15.98 5.91 13.08 3 9.52 3C5.91 3 3 5.91 3 9.52C3 13.08 5.91 15.98 9.52 15.98C11.11 15.98 12.61 15.42 13.73 14.44L14.02 14.72V15.52L18.98 20.48L20.48 18.98L15.52 14.02ZM9.52 14.02C7.03 14.02 5.02 12 5.02 9.52C5.02 7.03 7.03 5.02 9.52 5.02C12 5.02 14.02 7.03 14.02 9.52C14.02 12 12 14.02 9.52 14.02Z',
  lib_home: 'M9.98 20.02V14.02H14.02V20.02H18.98V12H21.98L12 3L2.02 12H5.02V20.02H9.98Z',
  lib_sort: 'M3 18H9V15.98H3V18ZM3 6V8.02H21V6H3ZM3 12.98H15V11.02H3V12.98Z',
  lib_settings: 'M19.12 12.94C19.17 12.66 19.22 12.33 19.22 12C19.22 11.67 19.17 11.34 19.12 11.06L21.14 9.47C21.33 9.33 21.38 9.05 21.28 8.86L19.36 5.53C19.22 5.34 18.98 5.25 18.75 5.34L16.36 6.28C15.89 5.91 15.33 5.58 14.77 5.34L14.39 2.81C14.34 2.58 14.16 2.39 13.92 2.39H10.08C9.84 2.39 9.66 2.58 9.61 2.81L9.23 5.34C8.67 5.58 8.11 5.91 7.64 6.28L5.25 5.34C5.02 5.25 4.78 5.34 4.64 5.53L2.72 8.86C2.62 9.09 2.67 9.33 2.86 9.47L4.88 11.06C4.83 11.34 4.78 11.67 4.78 12C4.78 12.33 4.83 12.66 4.88 12.94L2.86 14.53C2.67 14.67 2.62 14.95 2.72 15.14L4.64 18.47C4.78 18.66 5.02 18.75 5.25 18.66L7.64 17.72C8.11 18.09 8.67 18.42 9.23 18.66L9.61 21.19C9.66 21.42 9.84 21.61 10.08 21.61H13.92C14.16 21.61 14.34 21.42 14.39 21.19L14.77 18.66C15.33 18.42 15.89 18.09 16.36 17.72L18.75 18.66C18.98 18.75 19.22 18.66 19.36 18.47L21.28 15.14C21.38 14.91 21.33 14.67 21.14 14.53L19.12 12.94ZM12 15.61C10.03 15.61 8.39 13.97 8.39 12C8.39 10.03 10.03 8.39 12 8.39C13.97 8.39 15.61 10.03 15.61 12C15.61 13.97 13.97 15.61 12 15.61Z',
  lib_group: 'M12 2.02 6.52 11.02H17.48L12 2.02ZM12 5.86 13.92 9H10.08L12 5.86ZM17.48 12.98C15 12.98 12.98 15 12.98 17.48C12.98 19.97 15 21.98 17.48 21.98C19.97 21.98 21.98 19.97 21.98 17.48C21.98 15 19.97 12.98 17.48 12.98ZM17.48 20.02C16.12 20.02 15 18.89 15 17.48C15 16.12 16.12 15 17.48 15C18.89 15 20.02 16.12 20.02 17.48C20.02 18.89 18.89 20.02 17.48 20.02ZM3 21.52H11.02V13.5H3V21.52ZM5.02 15.52H9V19.5H5.02V15.52Z',
  lib_shuffle: 'M10.59 9.19 5.39 3.98 3.98 5.39 9.19 10.59 10.59 9.19ZM14.48 3.98 16.55 6.05 3.98 18.61 5.39 20.02 17.95 7.45 20.02 9.52V3.98H14.48ZM14.81 13.41 13.41 14.81 16.55 17.95 14.48 20.02H20.02V14.48L17.95 16.55L14.81 13.41Z',
  lib_arrow_up: 'M3.98 12 5.39 13.41 11.02 7.83V20.02H12.98V7.83L18.56 13.41L20.02 12L12 3.98L3.98 12Z',
  lib_arrow_down: 'M20.02 12 18.61 10.59 12.98 16.17V3.98H11.02V16.17L5.44 10.59L3.98 12L12 20.02L20.02 12Z',
  lib_expand_more: 'M16.59 8.58 12 13.17 7.41 8.58 6 9.98 12 15.98 18 9.98 16.59 8.58Z',
  lib_expand_less: 'M12 8.02 6 14.02 7.41 15.42 12 10.83 16.59 15.42 18 14.02 12 8.02Z',
  lib_clear_filters: 'M19.78 5.62C20.3 4.97 19.83 3.98 18.98 3.98H6.84L14.81 11.95L19.78 5.62ZM2.81 2.81 1.41 4.22 9.98 12.98V18.98C9.98 19.55 10.45 20.02 11.02 20.02H12.98C13.55 20.02 14.02 19.55 14.02 18.98V16.83L19.78 22.59L21.19 21.19L2.81 2.81Z',
  lib_show: 'M9.98 18H14.02V15.98H9.98V18ZM3 6V8.02H21V6H3ZM6 12.98H18V11.02H6V12.98Z',
  lib_display: 'M3 3V11.02H11.02V3H3ZM9 9H5.02V5.02H9V9ZM3 12.98V21H11.02V12.98H3ZM9 18.98H5.02V15H9V18.98ZM12.98 3V11.02H21V3H12.98ZM18.98 9H15V5.02H18.98V9ZM12.98 12.98V21H21V12.98H12.98ZM18.98 18.98H15V15H18.98V18.98Z',
  lib_chevron_right: 'M9.98 6 8.58 7.41 13.17 12 8.58 16.59 9.98 18 15.98 12 9.98 6Z',
  lib_favorite: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  lib_check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  lib_folder: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  lib_movie: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z',
  lib_play: 'M8 5v14l11-7z',
  lib_person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  lib_home_plain: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
})
// The Genres and Favorites toolbars draw Material Symbols on a 960 grid.
SYMBOLS.lib_sort_az = 'm80-280 162-400h63l161 400h-63l-38-99H181l-38 99H80Zm121-151h144l-70-185h-4l-70 185Zm347 151v-62l233-286H566v-52h272v63L607-332h233v52H548ZM384-784l96-96 96 96H384Zm96 704-96-96h192l-96 96Z'
SYMBOLS.lib_settings_outline = 'm388-80-20-126q-19-7-40-19t-37-25l-118 54-93-164 108-79q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521L80-600l93-164 118 54q16-13 37-25t40-18l20-127h184l20 126q19 7 40.5 18.5T669-710l118-54 93 164-108 77q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l108 78-93 164-118-54q-16 13-36.5 25.5T592-206L572-80H388Zm48-60h88l14-112q33-8 62.5-25t53.5-41l106 46 40-72-94-69q4-17 6.5-33.5T715-480q0-17-2-33.5t-7-33.5l94-69-40-72-106 46q-23-26-52-43.5T538-708l-14-112h-88l-14 112q-34 7-63.5 24T306-642l-106-46-40 72 94 69q-4 17-6.5 33.5T245-480q0 17 2.5 33.5T254-413l-94 69 40 72 106-46q24 24 53.5 41t62.5 25l14 112Zm44-210q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Zm0-130Z'
paths.lib_sort_az = SYMBOLS.lib_sort_az
paths.lib_settings_outline = SYMBOLS.lib_settings_outline
WANTED.push(...Object.keys(paths).filter((n) => n.startsWith('lib_')))

// The music screens' glyphs, as mus_<name>: the Immersive header and hero, the chips, the player's
// transport and panel toggles.
{
  SYMBOLS.mus_filter = MUSIC.filter
  SYMBOLS.mus_play = MUSIC.play
  paths.mus_heart_outline = MUSIC_HEART_OUTLINE
  paths.mus_heart = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
  paths.mus_equalizer = 'M4 20h3V10H4v10zm6 0h3V4h-3v16zm6 0h3v-7h-3v7z'
  SYMBOLS.mus_note = MUSIC.note
  for (const [id, d] of Object.entries(MUSIC_CHIPS)) SYMBOLS[`mus_chip_${id}`] = d
  for (const [name, comp] of Object.entries({
    shuffle: 'IconShuffle', previous: 'IconPrevious', play: 'IconPlay', pause: 'IconPause', next: 'IconNext',
    repeat: 'IconRepeat', repeat_one: 'IconRepeatOne', favorite: 'IconFavorite', favorite_filled: 'IconFavoriteFilled',
    playlist_add: 'IconPlaylistAdd', lyrics: 'IconLyrics', queue: 'IconQueueMusic', stop: 'IconStop',
  })) {
    if (PLAYER[comp]) SYMBOLS[`mus_p_${name}`] = PLAYER[comp]
  }
  Object.assign(paths, SYMBOLS)
  WANTED.push(...Object.keys(paths).filter((n) => n.startsWith('mus_')))
  pick(core, { play_arrow: 'core_play_arrow', album: 'core_album', queue_music: 'core_queue_music', sort_by_alpha: 'core_sort_by_alpha', sort: 'core_sort', category: 'core_category' })
}

// Home's Library Buttons row and the Incomplete recording badge, as home_<name>.
{
  const block = homeText.slice(homeText.indexOf('HOME_MATERIAL_ICON_PATHS'))
  for (const name of ['bookmark', 'extension', 'folder', 'folder_open', 'image', 'list', 'live_tv', 'movie', 'music_note', 'tv', 'volume_up']) {
    const m = block.match(new RegExp(`\\b${name}: '([^']+)'`))
    if (m) SYMBOLS[`home_${name}`] = m[1]
  }
  Object.assign(paths, SYMBOLS)
  const grid = homeText.match(/\bgrid_view_rounded: '([^']+)'/)
  if (grid) paths.home_grid_view_rounded = grid[1]
  // The calendar rows' See All card.
  const cal = homeText.match(/\bcalendar_month: '([^']+)'/)
  if (cal) paths.home_calendar_month = cal[1]
  // The Watching on MDBList row's globe.
  const globe = homeText.match(/\bpublic: '([^']+)'/)
  if (globe) paths.home_public = globe[1]
  paths.home_incomplete = INCOMPLETE_BADGE
  WANTED.push(...Object.keys(paths).filter((n) => n.startsWith('home_')))
}

// Spotlight's summary card badges, as spot_<name>.
for (const name of ['groups', 'video_library', 'star_shine', 'rate_review', 'queue_music', 'album', 'playlist_play', 'format_list_numbered', 'info', 'menu_book']) {
  const d = MATERIAL_SYMBOLS[name]
  if (!d) continue
  SYMBOLS[`spot_${name}`] = d
  paths[`spot_${name}`] = d
  WANTED.push(`spot_${name}`)
}

// The video player's OSD glyphs, as osd_<Name>: Material Symbols on a 960
// grid, and the live player's GlyphIcons on a 24 grid.
for (const [comp, d] of [...Object.entries(PLAYER), ...Object.entries(PLAYER_GLYPHS)]) {
  const name = `osd_${comp.replace(/^Icon/, '')}`
  if (PLAYER[comp]) SYMBOLS[name] = d
  paths[name] = d
  WANTED.push(name)
}

// The chat banner's glyph, a 960 grid symbol.
SYMBOLS.forum = paths.forum
WANTED.push('forum')

const out = new URL('../public/icons/', import.meta.url)
mkdirSync(out, { recursive: true })
const missing = []
for (const name of WANTED) {
  const d = paths[name]
  if (!d) {
    missing.push(name)
    continue
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="${SYMBOLS[name] ? '0 -960 960 960' : '0 0 24 24'}"><path fill="#ffffff" d="${d}"/></svg>`
  const image = execFileSync('magick', ['-background', 'none', '-density', '384', 'svg:-', '-resize', '64x64', '-define', 'webp:lossless=true', '-define', 'webp:exact=true', '-define', 'webp:method=6', 'webp:-'], { input: svg })
  writeFileSync(new URL(`${name}.webp`, out), image)
}
// The nav's own glyphs, as nav_<name>, plus Seerr's layered mark
// and the Watch Parties group, each drawn whole with its own viewBox.
const navSvgs = {}
for (const [name, d] of Object.entries(NAV)) {
  navSvgs[`nav_${name.replace(/[A-Z]/g, (ch) => '_' + ch.toLowerCase())}`] = `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`
}
for (const name of ['calendar_month_rounded', 'music_note_rounded', 'movie_rounded', 'tv_rounded', 'menu_book_rounded', 'live_tv_rounded',
  'photo_library_rounded', 'collections_bookmark_rounded', 'playlist_play_rounded', 'video_library_rounded', 'sports_esports']) {
  const m = homeText.match(new RegExp(`\\b${name}: '(M[^']+)'`))
  if (m) navSvgs[`nav_${name}`] = `<svg viewBox="0 0 24 24"><path d="${m[1]}"/></svg>`
}
// The Classic details style's glyphs, as cls_<name>.
// The play glyph is the browser's own triangle for Play's text arrow, 29 by 34 in a 34 box.
Object.assign(navSvgs, {
  cls_play_glyph: '<svg viewBox="0 0 34 34"><path d="M2.5 0L31.5 17 2.5 34z"/></svg>',
  cls_play_circle: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>',
  cls_check: '<svg viewBox="0 0 24 24"><path d="M21 7L9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59 21 7z"/></svg>',
  cls_check_compact: '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  cls_heart: '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  cls_person: '<svg viewBox="0 0 24 24"><path d="M12 4a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"/></svg>',
  cls_poster: '<svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>',
  cls_chapter: '<svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/></svg>',
  cls_extra: '<svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>',
})
navSvgs.nav_seerr = SEERR_SVG
navSvgs.nav_syncplay = `<svg viewBox="0 -960 960 960"><path d="${DETAIL.group}"/></svg>`
// The player's Still Watching dialog draws an outlined eye.
navSvgs.player_still_watching = '<svg viewBox="0 0 24 24"><path fill="none" stroke="#ffffff" stroke-width="1.8" d="M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7z"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="#ffffff" stroke-width="1.8"/></svg>'
for (const [name, svg] of Object.entries(navSvgs)) {
  const doc = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="#ffffff"')
  const image = execFileSync('magick', ['-background', 'none', '-density', '384', 'svg:-', '-resize', '64x64', '-define', 'webp:lossless=true', '-define', 'webp:exact=true', '-define', 'webp:method=6', 'webp:-'], { input: doc })
  writeFileSync(new URL(`${name}.webp`, out), image)
}
console.log(`rendered ${Object.keys(navSvgs).length} nav icons`)
console.log(`rendered ${WANTED.length - missing.length} icons${missing.length ? `, missing: ${missing.join(', ')}` : ''}`)
