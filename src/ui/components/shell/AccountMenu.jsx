import $L from '../../../services/i18n.js'
import { createSignal, onMount } from 'solid-js'
import { hasFocus } from '@solidtv/solid'
import ProfileCarousel, { carouselHeight } from '../account/ProfileCarousel.jsx'
import PillRow from '../account/PillRow.jsx'
import { switcherColors } from '../account/look.js'
import { rowFont, rowUiFont } from '../settings/rowFont.js'
import { getUserImageUrl } from '../../../services/jellyfinApi.js'
import * as multiServerManager from '../../../services/multiServerManager.js'
import * as settings from '../../../state/settings.js'
import { loadServers } from '../../../state/auth.js'
import { getStore } from '../../../state/store.js'

const BRAND_NAMES = { jellyfin: 'Jellyfin', emby: 'Emby', plex: 'Plex', silo: 'Silo' }
const ts = (v) => (v ? Date.parse(v) || 0 : 0)
const byName = (a, b) => (a.username || '').localeCompare(b.username || '', undefined, { sensitivity: 'base' })

// The saved accounts in the order the serverSortBy setting asks for.
const sorted = (list) => {
  const by = settings.get('serverSortBy') || 'name'
  const out = list.slice()
  if (by === 'recent') return out.sort((a, b) => ts(b.lastConnected) - ts(a.lastConnected) || byName(a, b))
  if (by === 'added') return out.sort((a, b) => ts(b.addedDate) - ts(a.addedDate) || byName(a, b))
  return out.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }) || byName(a, b))
}

// The account menu, opened from the nav's avatar: Switch User over a dark scrim, every saved
// account in the profile carousel (the active one ticked and marked Active), and Add User, Select
// Server, Sign Out and, when anyone else is saved, Sign Out All Users. It's drawn in the theme's
// accent. It loads the accounts and takes focus as it mounts, keeps every key, and tells the
// holder what was picked through onAccountMenu(action, account), Back being 'close'.
// shortcut: there's no Remove User here, since earlier versions only offered it to a pointer.
export default function AccountMenu(props) {
  const store = getStore()
  const [items, setItems] = createSignal([])
  const [start, setStart] = createSignal(0)
  const [signedIn, setSignedIn] = createSignal('')
  const [others, setOthers] = createSignal(false)
  const colors = switcherColors()
  let carousel
  let pills
  let open = false
  const tell = (action, account) => props.onAccountMenu && props.onAccountMenu(action, account)
  const pillList = () => {
    const list = [
      { id: 'addUser', label: $L('Add User'), icon: 'person' },
      { id: 'addServer', label: $L('Select Server'), icon: 'home' },
      { id: 'signOut', label: $L('Sign Out') },
    ]
    if (others()) list.push({ id: 'signOutAll', label: $L('Sign Out All Users'), danger: true })
    return list
  }
  // The carousel sits centered between the header and the pills (24dp padding), at the height the
  // face in the middle gives it, so it moves as that face's lines change, as Login's does.
  const carouselY = () => {
    const list = items()
    const h = list.length ? carouselHeight(list[start()] || list[0], list.length, 31.25) : 0
    return 110.28 + 40.07 + (832.85 - 80.14 - h) / 2
  }
  const focusPills = (id) => {
    pills.select(id)
    pills.setFocus()
  }
  onMount(async () => {
    const { all, active: current } = await loadServers()
    const list = sorted(all)
    const active = current ? list.findIndex((s) => s.serverId === current.serverId && s.userId === current.userId) : -1
    const me = active >= 0 ? list[active] : null
    setStart(Math.max(0, active))
    setItems(
      list.map((s, i) => {
        const on = i === active
        const tag = on && store.user && store.user.PrimaryImageTag ? store.user.PrimaryImageTag : s.primaryImageTag
        const brand = BRAND_NAMES[s.serverType || 'jellyfin']
        const lines = [{ text: brand ? `${s.name} · ${brand}` : s.name }]
        if (on) lines.push({ text: $L('Active'), accent: true })
        return {
          key: `${s.serverId}-${s.userId}`,
          id: s.userId,
          name: s.username,
          imageUrl: getUserImageUrl(s.url, s.userId, tag, s.serverType),
          badge: on ? 'active' : null,
          lines,
          server: s,
        }
      }),
    )
    // Sign Out already takes a Silo profile's whole household, so Sign Out All Users is only
    // offered for more than that.
    setOthers(me ? list.some((s) => s !== me && !multiServerManager.sameSiloHousehold(s, me)) : list.length > 1)
    setSignedIn(me ? $L('Signed in as {user} on {server}').replace('{user}', me.username || '').replace('{server}', me.name || '') : '')
    open = true
    carousel.setIndex(start())
    if (items().length) carousel.setFocus()
    else focusPills('addUser')
  })
  const onPill = async (id) => {
    if (id !== 'signOutAll') return tell(id)
    // Every saved server goes, including ones kept after their last user signed out, and then
    // App's Sign Out finds nobody left and goes to sign-in.
    // shortcut: Silo logins aren't ended on the server here. Add that along with Silo sign-out.
    const unique = await multiServerManager.getUniqueServers().catch(() => [])
    for (let i = 0; i < unique.length; i++) await multiServerManager.removeServer(unique[i].serverId)
    tell('signOut')
  }
  return (
    <view
      ref={props.ref}
      width={1920}
      height={1080}
      color="#05070ee6"
      // Down goes from the carousel to the pill nearest its middle, and Up goes back.
      onDown={() => {
        if (!open || hasFocus(pills)) return true
        let best = 'addUser'
        let bestD = Infinity
        pills.laid().forEach((p) => {
          const d = Math.abs(p.x + p.w / 2 - 960)
          if (d < bestD) {
            bestD = d
            best = p.key
          }
        })
        focusPills(best)
        return true
      }}
      onUp={() => {
        if (items().length) carousel.setFocus()
        return true
      }}
      onBack={() => {
        tell('close')
        return true
      }}
      onKeyPress={() => true}
    >
      <text fontFamily={rowUiFont('bold')} fontSize={40.07} lineHeight={46.88} x={96.84} y={67.08} color={colors.base}>
        {$L('Switch User')}
      </text>
      <text
        fontFamily={rowFont(signedIn())}
        fontSize={25.044}
        lineHeight={29.3}
        x={1823.16}
        y={78.7}
        mountX={1}
        color={colors.base + 'a6'}
      >
        {signedIn() || ' '}
      </text>
      <ProfileCarousel
        ref={(n) => (carousel = n)}
        onPointerFace={() => carousel.setFocus()}
        y={carouselY()}
        items={items()}
        colors={colors}
        lineH={31.25}
        roboto
        onCarouselIndex={setStart}
        onCarouselActivate={(item) => tell(item.badge === 'active' ? 'close' : 'switch', item.server)}
      />
      <PillRow ref={(n) => (pills = n)} y={943.13} pills={pillList()} colors={colors} onPill={onPill} onPointerPill={(id) => focusPills(id)} />
    </view>
  )
}
