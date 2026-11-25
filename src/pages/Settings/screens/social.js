// The Achievement Badges and Friends screens: the overview with the rank header, the badges,
// quests, leaderboard, recap, stats, activity, library completion, the loadout, shop and
// appearance, and the friends list, a person's page, requests, finding people, privacy, the chats,
// a chat and a group's info. Each screen keeps its state on its view under `s`, which starts over
// every time the screen comes back on top.
import $L from '../../../services/i18n.js'
import * as settings from '../../../state/settings.js'
import * as achievementsApi from '../../../services/achievementsApi.js'
import * as ach from '../../../state/achievements.js'
import { getApiKey, getServerUrl, getUserId } from '../../../services/jellyfinApi.js'
import {
  BADGE_FILTERS, groupBadges, leaderboardValue, parseHexColor, rarityColor, statsAreEmpty,
  REROLLED, REROLL_FAILED, POWER_UP_USED, PURCHASE_BOUGHT,
  COSMETIC_AVATAR, COSMETIC_RANK_TITLE, COSMETIC_CHANGED,
  cosmeticsOf, equippedCosmetic, ownsCosmetic, wornAvatarIcon, wornTitle, cosmeticsAreEmpty, wearingCosmetic, boughtCosmetic,
  sameUserId, threadIsPhoto,
} from '../../../utils/achievementsModel.js'
import { relativeTimeLabel } from '../../../utils/relativeTime.js'
import { localeDate } from '../../../utils/dateFormat.js'
import { rowFont as fontFor } from '../../../ui/components/settings/rowFont.js'
import { navEntry, toggleEntry } from '../schemaEntries.js'
import * as B from '../../../ui/components/settings/social/build.js'
import { dressCard } from '../../../ui/components/settings/social/dress.js'
import { ACH_ICON_NAMES } from '../../../ui/components/settings/social/achNames.js'

export const SCREENS = {}
export const CUSTOM = {}

const ACCENT = '#00a4dc'
const OVERALL_BOARD = 'score'
const BOARDS = [OVERALL_BOARD, 'movies', 'episodes', 'hours', 'streak', 'series', 'unlocked']
const PERIODS = ['week', 'month', 'year']
const CHAT_POLL_MS = 10000

const fmt = (text, values) => Object.keys(values).reduce((out, key) => out.replace('{' + key + '}', String(values[key])), text)
const ICONS = {}
ACH_ICON_NAMES.forEach((name) => (ICONS[name] = true))
// The art by its lowercased name, or the plugin's trophy for one nothing knows.
const achIcon = (name) => {
  const key = String(name || '').trim().toLowerCase()
  return ICONS[key] ? key : 'emoji_events'
}
const shell = (icon, color, dimmed) => ({
  kind: 'tile',
  icon: achIcon(icon),
  src: 'icons/ach/' + achIcon(icon) + '.webp',
  fill: B.tint(color, 0.18),
  edge: B.tint(color, 0.45),
  ink: B.tint(color, 1),
  dimmed: !!dimmed,
})
const row = (o) => {
  const block = B.cardRow(o)
  dressCard(block.card)
  return block
}
const section = (k, text) => ({ type: 'section', k: 'sec-' + k, text })
const mediumDate = (date) => localeDate(date, { year: 'numeric', month: 'short', day: 'numeric' })

// A screen's state starts over each time it comes back on top. Settings asks for a screen's
// entries on every change, so only the first ask after it became the base one starts it.
let vids = 0
const stateOf = (page, view) => {
  if (!view.vid) view.vid = ++vids
  if (page._socialTop !== view.vid || !view.s) {
    page._socialTop = view.vid
    const s = { mountedAt: Date.now(), want: view.back || null, ready: false }
    view.s = s
    view.back = null
    // The list hands focus to whatever row sits where the last screen's was before the new screen
    // takes its own, and a tab or badge reacting to that would scroll or switch for nothing.
    page.$setTimeout(() => (s.ready = true), 0)
  }
  return view.s
}
const isTop = (page, view) => {
  const st = page.stack
  return !!view.vid && !!st.length && st[st.length - 1].vid === view.vid
}
// A read that lands within 50ms of the screen opening, or 230ms when Back is returning to a row,
// moves the focus there. A screen whose read lands later keeps whatever focus it opened with, or
// none, and then the first press lands on its first row.
const settle = (page, view) => {
  const s = view.s
  if (Date.now() - s.mountedAt > (s.want ? 230 : 50)) return
  page.$setTimeout(() => {
    if (isTop(page, view) && page.zone === 'list') page.focusList(s.want || null)
  }, 0)
}
// Opens a screen, remembering the row to come back to.
const go = (page, view) => {
  if (page.current) page.current.back = view.returnFocusTo
  page.push(view)
}
// Reads [key] once per showing, keeping undefined while it's on its way and null when it failed.
const read = (page, view, key, get) => {
  const s = stateOf(page, view)
  if (key in s) return s[key]
  s[key] = undefined
  Promise.resolve()
    .then(get)
    .then(
      (value) => value,
      () => null
    )
    .then((value) => {
      if (view.s !== s) return
      s[key] = value
      page.refresh()
      settle(page, view)
    })
  return undefined
}
const reread = (page, view, key) => {
  delete view.s[key]
  page.refresh()
}

const open = (view, returnFocusTo, extra) => (page) => go(page, { view, returnFocusTo, ...extra })
const openRow = (id, title, desc, icon, view, enabled = true) =>
  navEntry('setting-' + id, title, desc, icon, enabled ? { press: open(view, 'setting-' + id) } : {})

const loading = () => B.message('loading', $L('Loading...'))
const loadFailed = (k, sid, retry, text) => [B.message(k, text || $L('Could not load your achievements.')), B.retry(k + '-retry', sid, $L('Retry'), retry)]

// Asks before spending, in a dialog over the whole screen.
const askSpend = (page, title, body, confirm) => {
  if (page.openConfirm) page.openConfirm({ title, message: body, confirm: $L('Confirm'), onConfirm: () => confirm(page) })
}

// Whether the server runs the Achievement Badges plugin and which parts are on, from the shared
// achievements state App keeps for the signed in account.
export const load = (page, data, done) => {
  if (!getServerUrl() || !getApiKey()) return
  ach.achievementsReady().then(() => {
    data.achievements = ach.achievements()
    done()
  })
}

// The tab bar keeps the focused tab in view. An expanded bar opens the tab focus lands on, and the
// rest open on OK.
const tabsBlock = (view, k, ids, labels, active, expanded, select) => {
  const s = view.s
  const tabs = ids.map((id, i) => ({ id, label: labels[i], sid: k + '-' + id }))
  const block = B.tabBar(k, tabs, active, s[k + 'Scroll'] || 0, () => false, (pg, id) => select(pg, id))
  block.stops.forEach((stop, i) => {
    stop.onFocus = (pg) => {
      if (!s.ready) return
      const next = B.tabScroll(tabs, active, s[k + 'Scroll'] || 0, i)
      if (next !== (s[k + 'Scroll'] || 0)) {
        s[k + 'Scroll'] = next
        pg.refresh()
      }
      if (expanded && tabs[i].id !== active) select(pg, tabs[i].id)
    }
  })
  return block
}

// Each showcase badge takes focus, and the row scrolls to show the one that has it.
const showcaseBlocks = (view, k, badges) => {
  const s = view.s
  const items = badges.map((badge) => {
    const color = rarityColor(badge.rarity)
    const icon = achIcon(badge.icon)
    return {
      sid: 'achievement-showcase-' + badge.id,
      title: badge.title,
      font: fontFor(badge.title),
      src: 'icons/ach/' + icon + '.webp',
      fill: B.tint(color, 0.18),
      edge: B.tint(color, 0.45),
      ink: B.tint(color, 1),
    }
  })
  const block = B.showcase(k, items, s[k + 'Scroll'] || 0, () => false)
  block.stops.forEach((stop, i) => {
    stop.onFocus = (pg) => {
      if (!s.ready) return
      const next = B.showcaseScroll(s[k + 'Scroll'] || 0, i)
      if (next !== (s[k + 'Scroll'] || 0)) {
        s[k + 'Scroll'] = next
        pg.refresh()
      }
    }
  })
  return [section(k, $L('Showcase')), block]
}

// Every achievements screen reads the overview again as it opens.
const overviewOf = (page, view) => read(page, view, 'overview', achievementsApi.loadOverview)

const rankBlock = (overview) => {
  const rank = overview.rank
  const summary = overview.summary
  const worn = overview.cosmetics
  let rankModel = null
  if (rank) {
    const color = parseHexColor(rank.tier.color) || ACCENT
    const icon = achIcon(wornAvatarIcon(worn) || rank.tier.icon)
    const name = wornTitle(worn) || rank.tier.name
    rankModel = {
      src: 'icons/ach/' + icon + '.webp',
      fill: B.tint(color, 0.18),
      edge: B.tint(color, 0.45),
      ink: B.tint(color, 1),
      name,
      nameFont: fontFor(name, 'bold'),
      score: fmt($L('{score} points'), { score: rank.score }),
      value: Math.min(1, Math.max(0, rank.progressToNext / 100)),
      note: rank.nextTier
        ? fmt($L('{points} points to {tier}'), { points: Math.max(0, rank.nextTier.minScore - rank.score), tier: rank.nextTier.name })
        : $L('Top rank reached'),
    }
  }
  const chips = summary
    ? [
        { icon: 'military_tech', label: fmt($L('{unlocked} of {total} badges'), { unlocked: summary.unlocked, total: summary.total }) },
        { icon: 'percent', label: `${summary.percentage.toFixed(1)}%` },
        { icon: 'local_fire_department', label: fmt($L('{days} day streak'), { days: summary.currentWatchStreak }) },
        { icon: 'emoji_events', label: fmt($L('Best: {days} days'), { days: summary.bestWatchStreak }) },
      ]
    : []
  return B.rankHeader('rank', rankModel, chips)
}

// The plugin's own unlock notification switch, which jellyfin-web follows too. It holds still until
// the plugin says which way it is, so it can't flip the wrong way.
const unlockToastRows = (page, view) => {
  const s = view.s
  const enabled = read(page, view, 'toasts', async () => {
    const got = await achievementsApi.fetchUnlockToastSettings()
    return got ? got.enabled : null
  })
  const out = [
    {
      type: 'card',
      sid: 'setting-achievements-unlockToasts',
      tight: true,
      title: $L('Unlock notifications'),
      sub: $L('Show a notification when you unlock a badge'),
      subTone: 'desc',
      icon: 'notifications_active',
      iconStyle: 'strong',
      trail: 'toggle',
      on: enabled === true,
      press:
        enabled === true || enabled === false
          ? async (pg) => {
              const before = s.toasts
              s.toasts = !before
              s.toastProblem = null
              pg.refresh()
              const saved = await achievementsApi.saveUnlockToasts(!before)
              if (saved) return
              s.toasts = before
              s.toastProblem = $L('Could not save your settings.')
              pg.refresh()
            }
          : null,
    },
  ]
  if (s.toastProblem) out.push(B.message('toast-problem', s.toastProblem))
  return out
}

SCREENS.achievements = {
  title: (page, view) => view.label || $L('Achievement Badges'),
  entries: (page, view) => {
    const overview = overviewOf(page, view)
    if (overview === undefined) return [loading()]
    if (!overview) return loadFailed('failed', 'achievements-retry', (pg) => reread(pg, view, 'overview'))
    const ctx = page.ctx.achievements || {}
    const unlocked = overview.badges.filter((badge) => badge.unlocked).length
    const questCount = overview.quests ? [...overview.quests.daily, ...overview.quests.weekly].filter((quest) => quest.completed).length : 0
    const libraries = Object.keys(overview.libraryCompletion)
    const out = [rankBlock(overview)]
    if (overview.equipped.length) out.push(...showcaseBlocks(view, 'showcase', overview.equipped))
    if (ctx.socialAvailable) out.push(openRow('achievements-friends', $L('Friends'), $L("See who's online and chat with people on this server"), 'groups', 'friends'))
    if (ctx.unlockToastsAvailable) out.push(...unlockToastRows(page, view))
    out.push(
      openRow(
        'achievements-badges',
        $L('Badges'),
        fmt($L('{unlocked} of {total} badges'), { unlocked, total: overview.badges.length }),
        'military_tech',
        'achievementsBadges',
        overview.badges.length > 0
      )
    )
    if (overview.questsEnabled && overview.quests && !overview.quests.isEmpty) {
      out.push(openRow('achievements-quests', $L('Quests'), fmt($L('{count} completed'), { count: questCount }), 'task_alt', 'achievementsQuests'))
    }
    if (overview.activityEnabled) out.push(openRow('achievements-activity', $L('Activity'), $L('What the server has unlocked lately'), 'bolt', 'achievementsActivity'))
    if (overview.leaderboardEnabled) {
      out.push(openRow('achievements-leaderboard', $L('Leaderboard'), $L('How you compare with other users on this server'), 'leaderboard', 'achievementsLeaderboard'))
    }
    out.push(openRow('achievements-stats', $L('Stats'), $L('Your records and how the server is doing'), 'bar_chart', 'achievementsStats'))
    out.push(openRow('achievements-recap', $L('Recap'), $L('What you watched recently'), 'insights', 'achievementsRecap'))
    out.push(openRow('achievements-loadout', $L('Loadout'), $L('Score to spend and the boosts you hold'), 'backpack', 'achievementsLoadout'))
    if (overview.cosmetics && !cosmeticsAreEmpty(overview.cosmetics)) {
      out.push(openRow('achievements-appearance', $L('Appearance'), $L('The avatar and title on your profile'), 'face_5', 'achievementsAppearance'))
    }
    if (libraries.length) {
      out.push(openRow('achievements-libraries', $L('Library completion'), fmt($L('{count} libraries'), { count: libraries.length }), 'collections_bookmark', 'achievementsLibrary'))
    }
    return out
  },
}

const badgeRow = (badge, press) => {
  const color = rarityColor(badge.rarity)
  const lines = [{ kind: 'heading', text: badge.isSecret ? $L('Hidden achievement') : badge.title }]
  if (badge.description && !badge.descriptionHidden) lines.push({ kind: 'caption', text: badge.description })
  if (!badge.unlocked && badge.targetValue > 0) {
    lines.push({ kind: 'bar', slim: true, value: badge.progress, fill: B.tint(color, 1) })
    lines.push({ kind: 'note', text: `${badge.currentValue} / ${badge.targetValue}` })
  }
  if (badge.unlocked && badge.unlockedAt) lines.push({ kind: 'note', text: fmt($L('Unlocked {date}'), { date: mediumDate(badge.unlockedAt) }) })
  return row({
    sid: 'achievement-badge-' + badge.id,
    press,
    lead: shell(badge.icon, color, !badge.unlocked),
    lines,
    trail: { kind: 'stack', top: badge.rarity, topColor: B.tint(color, 1), bottom: fmt($L('{points} pts'), { points: badge.score }) },
  })
}

SCREENS.achievementsBadges = {
  title: () => null,
  entries: (page, view) => {
    const overview = overviewOf(page, view)
    const s = view.s
    const filter = s.filter || BADGE_FILTERS[0]
    const opened = s.open || []
    const groups = groupBadges(overview ? overview.badges : [], filter, $L('Other'))
    const out = [
      tabsBlock(view, 'achievement-filter', BADGE_FILTERS, [$L('All'), $L('Unlocked'), $L('Locked')], filter, true, (pg, id) => {
        s.filter = id
        pg.refresh()
      }),
    ]
    if (!groups.length) {
      out.push(B.message('none', $L('Nothing here yet.')))
      return out
    }
    groups.forEach((group) => {
      const isOpen = opened.indexOf(group.category) >= 0
      out.push(
        navEntry(
          'setting-achievement-category-' + group.category,
          group.category,
          fmt($L('{unlocked} of {total} badges'), { unlocked: group.unlocked, total: group.badges.length }),
          isOpen ? 'folder_open' : 'folder',
          {
            press: (pg) => {
              s.open = isOpen ? opened.filter((name) => name !== group.category) : [...opened, group.category]
              pg.refresh()
            },
          }
        )
      )
      if (isOpen) {
        group.badges.forEach((badge) => out.push(badgeRow(badge, open('achievementsBadge', 'achievement-badge-' + badge.id, { badgeId: badge.id }))))
      }
    })
    return out
  },
}

// Details reads the whole record by id, so the row only has to say which item it was.
const openItem = (page, id) => page.$router.to(`/details/${id}`)

SCREENS.achievementsBadge = {
  title: () => null,
  entries: (page, view) => {
    const overview = overviewOf(page, view)
    const badge = (overview ? overview.badges : []).find((entry) => entry.id === view.badgeId)
    if (!badge) return []
    const chase = read(page, view, 'chase', () => achievementsApi.fetchBadgeChase(badge.id))
    if (chase === undefined) return [loading()]
    // The badge carries its own figures, so they stand in when the chase had nothing to say.
    const current = chase ? chase.current : badge.currentValue
    const target = chase ? chase.target : badge.targetValue
    const items = chase ? chase.items : []
    const out = [section('title', badge.isSecret ? $L('Hidden achievement') : badge.title)]
    if (badge.description && !badge.descriptionHidden) out.push(B.blurb('blurb', badge.description))
    out.push(section('progress', $L('Progress')))
    out.push(B.progress('progress', `${current} / ${target}`, { value: badge.progress, fill: B.tint(rarityColor(badge.rarity), 1) }))
    out.push(section('chase', $L('Suggested items to watch')))
    if (!items.length) out.push(B.message('none', $L('Nothing to suggest for this badge.')))
    items.forEach((item) => {
      const parts = [item.type, item.year > 0 ? String(item.year) : '', item.runtimeMinutes > 0 ? fmt($L('{minutes} min'), { minutes: item.runtimeMinutes }) : ''].filter(Boolean)
      const lines = [{ kind: 'heading', text: item.name }]
      if (parts.length) lines.push({ kind: 'caption', text: parts.join(' · ') })
      out.push(row({ sid: 'achievement-chase-' + item.id, press: (pg) => openItem(pg, item.id), lines }))
    })
    return out
  },
}

const scoreBank = (bank) => [section('bank', $L('Score bank')), B.progress('bank', fmt($L('{score} points'), { score: bank }))]

// The plugin sends English names for its three power-ups, so the panel words them itself.
const POWER_UP_TEXT = {
  XpBoost: { name: () => $L('XP Boost'), body: () => $L('Doubles score for an hour. Using it again restarts the hour.') },
  DoubleCredit: { name: () => $L('Double Credit'), body: () => $L('The next thing you finish counts twice towards badges.') },
  StreakFreeze: { name: () => $L('Streak Freeze'), body: () => $L('Covers one missed day. Only one can be banked.') },
}
const powerUpName = (type) => (POWER_UP_TEXT[type] ? POWER_UP_TEXT[type].name() : type)
const powerUpBody = (type) => (POWER_UP_TEXT[type] ? POWER_UP_TEXT[type].body() : '')
const heldLabel = (count) => {
  if (count <= 0) return $L('None held')
  if (count === 1) return $L('1 held')
  return fmt($L('{count} held'), { count })
}

// A write behind the busy flag that keeps what went wrong.
const spend = async (page, view, write) => {
  const s = view.s
  s.busy = true
  s.problem = ''
  page.refresh()
  const failed = await write()
  if (view.s !== s) return
  s.busy = false
  s.problem = failed || ''
  page.refresh()
}

SCREENS.achievementsLoadout = {
  title: () => null,
  entries: (page, view) => {
    const state = read(page, view, 'state', achievementsApi.fetchPowerUps)
    const s = view.s
    if (state === undefined) return [loading()]
    if (!state) return loadFailed('failed', 'loadout-retry', (pg) => reread(pg, view, 'state'))
    const out = [...scoreBank(state.bank), section('powerups', $L('Power-ups'))]
    state.slots.forEach((slot) => {
      const held = heldLabel(slot.count)
      const lines = [{ kind: 'heading', text: powerUpName(slot.type) }]
      if (powerUpBody(slot.type)) lines.push({ kind: 'caption', text: powerUpBody(slot.type) })
      lines.push({ kind: 'note', text: slot.active ? `${held} · ${$L('Running now')}` : held, color: slot.active ? '#00a4dcff' : null })
      // The row keeps its press only while there's one to spend, and it's never dimmed.
      out.push(
        row({
          sid: 'achievement-powerup-' + slot.type,
          lead: shell(slot.icon, ACCENT),
          lines,
          press:
            slot.count > 0 && !s.busy
              ? (pg) =>
                  askSpend(pg, $L('Use this power-up?'), $L("It's spent as soon as you confirm."), (p2) =>
                    spend(p2, view, async () => {
                      const result = await achievementsApi.usePowerUp(slot.type)
                      if (result.outcome !== POWER_UP_USED) return result.message || $L('Could not use that power-up.')
                      // Spending one costs no score, so only the inventory moves.
                      s.state = { bank: s.state.bank, slots: result.slots }
                      return null
                    })
                  )
              : null,
        })
      )
    })
    out.push(openRow('achievements-shop', $L('Shop'), $L('Spend score on more boosts'), 'storefront', 'achievementsShop'))
    if (s.problem) out.push(B.message('problem', s.problem))
    return out
  },
}

// The catalog carries no bank, so the two are read together.
const readShop = async () => {
  const [items, state] = await Promise.all([achievementsApi.fetchShopPowerUps(), achievementsApi.fetchPowerUps()])
  return { items, bank: state ? state.bank : 0 }
}

SCREENS.achievementsShop = {
  title: () => null,
  entries: (page, view) => {
    const data = read(page, view, 'data', readShop)
    const s = view.s
    if (!data) return [loading()]
    const out = [...scoreBank(data.bank)]
    if (!data.items.length) out.push(B.message('none', $L('Nothing for sale right now.')))
    data.items.forEach((item) => {
      const name = powerUpName(item.type)
      const affordable = item.priceScore <= data.bank && !s.busy
      const lines = [{ kind: 'heading', text: item.bundleSize > 1 ? fmt($L('{name} ×{count}'), { name, count: item.bundleSize }) : name }]
      if (powerUpBody(item.type)) lines.push({ kind: 'caption', text: powerUpBody(item.type) })
      out.push(
        row({
          sid: 'achievement-shop-' + item.id,
          lead: shell('storefront', ACCENT),
          lines,
          trail: { kind: 'text', size: 22, text: fmt($L('{score} points'), { score: item.priceScore }), color: affordable ? '#00a4dcff' : B.SECONDARY },
          press: affordable
            ? (pg) =>
                askSpend(pg, $L('Buy this?'), $L('It comes straight out of your score bank.'), (p2) =>
                  spend(p2, view, async () => {
                    const result = await achievementsApi.buyShopItem(item.id)
                    if (result.outcome !== PURCHASE_BOUGHT) return result.message || $L('Could not buy that.')
                    if (result.bankAfter !== null) s.data = { ...s.data, bank: result.bankAfter }
                    return null
                  })
                )
            : null,
        })
      )
    })
    if (s.problem) out.push(B.message('problem', s.problem))
    return out
  },
}

const COSMETIC_KINDS = [COSMETIC_AVATAR, COSMETIC_RANK_TITLE]

SCREENS.achievementsAppearance = {
  title: () => null,
  entries: (page, view) => {
    const worn = read(page, view, 'worn', achievementsApi.fetchCosmetics)
    const s = view.s
    if (worn === undefined) return [loading()]
    if (!worn) return loadFailed('failed', 'appearance-retry', (pg) => reread(pg, view, 'worn'))
    if (cosmeticsAreEmpty(worn)) return [B.message('none', $L('This server has no avatars or titles to wear.'))]
    const kind = s.kind || COSMETIC_AVATAR
    const out = [
      tabsBlock(view, 'appearance-tabs', COSMETIC_KINDS, [$L('Avatars'), $L('Titles')], kind, true, (pg, id) => {
        s.kind = id
        pg.refresh()
      }),
      ...scoreBank(worn.bank),
    ]
    cosmeticsOf(worn, kind).forEach((item) => {
      const wearing = equippedCosmetic(worn, item.kind) === item.id
      const held = ownsCosmetic(worn, item)
      const affordable = item.priceScore <= worn.bank
      const lines = [{ kind: 'heading', text: item.name }]
      if (wearing) lines.push({ kind: 'note', text: $L('Equipped'), color: '#00a4dcff' })
      if (!wearing && held) lines.push({ kind: 'note', text: $L('Owned') })
      if (!held && item.isEarned) {
        lines.push({ kind: 'note', text: fmt($L('Earned at {score} lifetime score'), { score: item.milestoneScore }) })
        lines.push({ kind: 'bar', slim: true, value: Math.min(1, worn.lifetimeScore / item.milestoneScore), fill: '#00a4dcff' })
      }
      let trail = null
      if (wearing) trail = { kind: 'check' }
      else if (!held && !item.isEarned) trail = { kind: 'text', size: 22, text: fmt($L('{score} points'), { score: item.priceScore }), color: affordable ? '#00a4dcff' : B.SECONDARY }
      let press = null
      if (!s.busy) {
        if (held) {
          // Puts one on, or takes it off when it's already the one worn.
          press = (pg) =>
            spend(pg, view, async () => {
              const result = wearing ? await achievementsApi.unequipCosmetic(item.kind) : await achievementsApi.equipCosmetic(item.id)
              if (result.outcome !== COSMETIC_CHANGED) return result.message || $L('Could not change how the profile looks.')
              s.worn = wearingCosmetic(s.worn, item.kind, wearing ? null : item.id)
              return null
            })
        } else if (!item.isEarned && affordable) {
          press = (pg) =>
            askSpend(pg, $L('Buy this?'), $L('It comes straight out of your score bank.'), (p2) =>
              spend(p2, view, async () => {
                const result = await achievementsApi.buyShopItem(item.id)
                if (result.outcome !== PURCHASE_BOUGHT) return result.message || $L('Could not buy that.')
                s.worn = boughtCosmetic(s.worn, item.id, result.bankAfter)
                return null
              })
            )
        }
      }
      out.push(row({ sid: 'achievement-cosmetic-' + item.id, lead: shell(item.icon, ACCENT), lines, trail, press }))
    })
    if (s.problem) out.push(B.message('problem', s.problem))
    return out
  },
}

// The counters worth showing, in the order they read best.
const statGroups = () => [
  {
    header: $L('Watched'),
    rows: [
      ['TotalItemsWatched', $L('Items watched')],
      ['MoviesWatched', $L('Films watched')],
      ['SeriesCompleted', $L('Series finished')],
      ['TotalHoursWatched', $L('Hours watched')],
      ['DaysWatched', $L('Days watched')],
      ['RewatchCount', $L('Rewatches')],
    ],
  },
  {
    header: $L('Bests'),
    rows: [
      ['BestWatchStreak', $L('Best watch streak')],
      ['BestLoginStreak', $L('Best login streak')],
      ['MaxEpisodesInSingleDay', $L('Most episodes in a day')],
      ['MaxMoviesInSingleDay', $L('Most films in a day')],
      ['LongestItemMinutes', $L('Longest single item')],
      ['BestComboCount', $L('Best combo')],
    ],
  },
  {
    header: $L('Habits'),
    rows: [
      ['LateNightSessions', $L('Late night sessions')],
      ['EarlyMorningSessions', $L('Early morning sessions')],
      ['WeekendSessions', $L('Weekend sessions')],
      ['DaysLoggedIn', $L('Days signed in')],
    ],
  },
  {
    header: $L('Variety'),
    rows: [
      ['UniqueLibrariesVisited', $L('Libraries visited')],
      ['UniqueGenresWatched', $L('Genres watched')],
      ['UniqueDecadesWatched', $L('Decades watched')],
      ['UniqueCountriesWatched', $L('Countries watched')],
      ['UniqueLanguagesWatched', $L('Languages watched')],
    ],
  },
]
// The value stays white on every card, the focused light one included.
const statRow = (sid, label, value) => row({ sid, lines: [{ kind: 'heading', text: label }], trail: { kind: 'text', size: 22, text: value, color: '#ffffffff' } })

SCREENS.achievementsStats = {
  title: () => null,
  entries: (page, view) => {
    const stats = read(page, view, 'stats', achievementsApi.fetchStats)
    if (stats === undefined) return [loading()]
    if (!stats || statsAreEmpty(stats)) return [B.message('none', $L('Nothing here yet.'))]
    const out = []
    statGroups().forEach((group) => {
      const shown = group.rows.filter(([key]) => key in stats.records)
      if (!shown.length) return
      out.push(section(group.header, group.header))
      shown.forEach(([key, label]) => {
        const count = stats.records[key]
        out.push(statRow('achievement-stat-' + key, label, key === 'LongestItemMinutes' ? fmt($L('{minutes} min'), { minutes: count }) : String(count)))
      })
    })
    if (Object.keys(stats.watchClock).length) {
      const hours = stats.watchClock
      const busiest = Array.from({ length: 24 }, (_, h) => hours[h] || 0).reduce((a, b) => Math.max(a, b), 0)
      out.push(section('clock', $L('When you watch')))
      if (busiest > 0) out.push(B.watchClock('clock', hours))
    }
    const server = stats.server
    if (server) {
      out.push(section('server', $L('This server')))
      const rows = [
        ['users', $L('Users'), String(server.users)],
        ['badges', $L('Badges unlocked'), String(server.badgesUnlocked)],
        ['items', $L('Items watched'), String(server.itemsWatched)],
        ['movies', $L('Films watched'), String(server.moviesWatched)],
        ['series', $L('Series finished'), String(server.seriesCompleted)],
        ['score', $L('Score earned'), String(server.score)],
        ...(server.mostCommonBadge ? [['common-badge', $L('Most common badge'), server.mostCommonBadge]] : []),
      ]
      rows.forEach(([key, label, value]) => out.push(statRow('achievement-stat-server-' + key, label, value)))
    }
    return out
  },
}

SCREENS.achievementsActivity = {
  title: () => null,
  entries: (page, view) => {
    const entries = read(page, view, 'entries', () => achievementsApi.fetchActivity())
    if (entries === undefined) return [loading()]
    if (!entries || !entries.length) return [B.message('none', $L('Nothing here yet.'))]
    return entries.map((entry, i) => {
      const lines = [{ kind: 'heading', text: fmt($L('{user} unlocked {badge}'), { user: entry.userName, badge: entry.badgeTitle }) }]
      if (entry.at) lines.push({ kind: 'note', text: relativeTimeLabel(entry.at) })
      return row({ sid: 'achievement-activity-' + i, lead: shell(entry.icon, rarityColor(entry.rarity)), lines })
    })
  },
}

// Quests start from the overview's sets once its read lands, not from the empty sets the screen
// opened with, so the screen doesn't come up blank.
SCREENS.achievementsQuests = {
  title: () => null,
  entries: (page, view) => {
    const overview = overviewOf(page, view)
    const s = view.s
    if (!s.quests && overview) s.quests = overview.quests || { daily: [], weekly: [] }
    const quests = s.quests || { daily: [], weekly: [] }
    const out = []
    const questRow = (quest) =>
      row({
        sid: 'achievement-quest-' + quest.id,
        lead: shell(quest.completed ? 'check_circle' : quest.icon, ACCENT),
        lines: [
          { kind: 'heading', text: quest.title },
          ...(quest.description ? [{ kind: 'caption', text: quest.description }] : []),
          { kind: 'bar', slim: true, value: quest.progress, fill: '#00a4dcff' },
          { kind: 'note', text: `${quest.current} / ${quest.target}` },
        ],
        trail: { kind: 'text', size: 26, text: fmt($L('+{points}'), { points: quest.reward }), tone: 'accent' },
      })
    const reroll = (weekly) => {
      const left = (weekly ? quests.weeklyRerollsLeft : quests.dailyRerollsLeft) || 0
      const spent = left <= 0
      const offered = !spent && !s.busy
      let caption = $L('Swap this set for a different one')
      if (spent) caption = weekly ? $L('Used this week, comes back Monday UTC') : $L('Used today, comes back at midnight UTC')
      return row({
        sid: 'setting-achievement-reroll-' + (weekly ? 'weekly' : 'daily'),
        dim: !offered,
        lead: { kind: 'glyph', icon: 'casino', src: 'icons/settings/casino.webp' },
        lines: [
          { kind: 'heading', text: weekly ? $L('Reroll weekly quests') : $L('Reroll daily quests') },
          { kind: 'caption', text: caption },
        ],
        press: offered
          ? (pg) =>
              askSpend(pg, $L('Reroll these quests?'), $L('You get one daily and one weekly reroll, and this spends it.'), async (p2) => {
                s.busy = true
                s.failed = false
                p2.refresh()
                const result = await achievementsApi.rerollQuests({ weekly })
                s.busy = false
                if (result.outcome === REROLL_FAILED) s.failed = true
                else {
                  // The server settles what's left whether it handed back a fresh set or refused.
                  const rerolled = result.outcome === REROLLED
                  const remaining = rerolled ? result.rerollsLeft : 0
                  s.quests = weekly
                    ? { ...s.quests, weekly: rerolled ? result.quests : s.quests.weekly, weeklyRerollsLeft: remaining }
                    : { ...s.quests, daily: rerolled ? result.quests : s.quests.daily, dailyRerollsLeft: remaining }
                }
                p2.refresh()
              })
          : null,
      })
    }
    if (quests.daily.length) {
      out.push(section('daily', $L('Daily')))
      quests.daily.forEach((quest) => out.push(questRow(quest)))
      out.push(reroll(false))
    }
    if (quests.weekly.length) {
      out.push(section('weekly', $L('Weekly')))
      quests.weekly.forEach((quest) => out.push(questRow(quest)))
      out.push(reroll(true))
    }
    if (s.failed) out.push(B.message('failed', $L('Could not reroll those quests.')))
    return out
  },
}

// A board other than the overall one is read when it's picked, and the pick holds while it reads.
SCREENS.achievementsLeaderboard = {
  title: () => null,
  entries: (page, view) => {
    const overview = overviewOf(page, view)
    const s = view.s
    const board = s.board || OVERALL_BOARD
    const labels = [$L('Score'), $L('Movies'), $L('Episodes'), $L('Hours'), $L('Streak'), $L('Series'), $L('Badges')]
    const out = [
      tabsBlock(view, 'achievement-board', BOARDS, labels, board, false, (pg, id) => {
        if (s.loading || id === board) return
        s.board = id
        if (id !== OVERALL_BOARD) {
          s.loading = true
          achievementsApi.fetchLeaderboard({ category: id }).then((rows) => {
            if (view.s !== s || s.board !== id) return
            s.rows = rows
            s.loading = false
            pg.refresh()
          })
        }
        pg.refresh()
      }),
    ]
    const entries = board === OVERALL_BOARD ? (overview ? overview.leaderboard : []) : s.rows || []
    if (s.loading) out.push(loading())
    else if (!entries.length) out.push(B.message('none', $L('Nothing here yet.')))
    else {
      entries.forEach((entry, index) => {
        const lines = [{ kind: 'heading', text: entry.userName }]
        if (entry.customTitle || entry.unlocked !== null) {
          lines.push({ kind: 'caption', text: entry.customTitle || fmt($L('{unlocked} of {total} badges'), { unlocked: entry.unlocked, total: entry.total || 0 }) })
        }
        out.push(
          row({
            sid: 'achievement-board-row-' + index,
            lead: { kind: 'gutter', text: String(index + 1) },
            lines,
            trail: { kind: 'text', size: 28, text: String(leaderboardValue(entry)), tone: 'strong' },
          })
        )
      })
    }
    return out
  },
}

const countRows = (k, title, counts, idPrefix) => [
  section(k, title),
  ...counts.map((count, index) =>
    row({ sid: idPrefix + '-' + index, lines: [{ kind: 'heading', text: count.name }], trail: { kind: 'text', size: 28, text: String(count.count), tone: 'strong' } })
  ),
]

SCREENS.achievementsRecap = {
  title: () => null,
  entries: (page, view) => {
    const overview = overviewOf(page, view)
    const s = view.s
    const period = s.period || achievementsApi.DEFAULT_RECAP_PERIOD
    const out = [
      tabsBlock(view, 'achievement-period', PERIODS, [$L('Week'), $L('Month'), $L('Year')], period, false, (pg, id) => {
        if (s.loading || id === period) return
        s.period = id
        if (id !== achievementsApi.DEFAULT_RECAP_PERIOD) {
          s.loading = true
          achievementsApi.fetchRecap(id).then((next) => {
            if (view.s !== s || s.period !== id) return
            s.recap = next
            s.loading = false
            pg.refresh()
          })
        }
        pg.refresh()
      }),
    ]
    const recap = period === achievementsApi.DEFAULT_RECAP_PERIOD ? (overview ? overview.recap : null) : s.recap
    if (s.loading) out.push(loading())
    else if (!recap) out.push(B.message('none', $L('Nothing here yet.')))
    else {
      out.push(
        B.chips(
          'recap-chips',
          [
            { icon: 'movie', label: `${recap.moviesWatched} ${$L('Movies')}` },
            { icon: 'live_tv', label: `${recap.episodesWatched} ${$L('Episodes')}` },
            { icon: 'calendar_month', label: fmt($L('{count} days watched'), { count: recap.daysWatched }) },
            { icon: 'military_tech', label: fmt($L('{count} badges earned'), { count: recap.badgesUnlocked }) },
          ],
          0,
          16
        )
      )
      if (recap.topGenres.length) out.push(...countRows('genres', $L('Genres'), recap.topGenres, 'achievement-genre'))
      if (recap.topDirectors.length) out.push(...countRows('directors', $L('Top directors'), recap.topDirectors, 'achievement-director'))
      if (recap.topActors.length) out.push(...countRows('actors', $L('Top actors'), recap.topActors, 'achievement-actor'))
    }
    return out
  },
}

SCREENS.achievementsLibrary = {
  title: () => null,
  entries: (page, view) => {
    const overview = overviewOf(page, view)
    const completion = overview ? overview.libraryCompletion : {}
    return Object.keys(completion)
      .sort()
      .map((name) =>
        row({
          sid: 'achievement-library-' + name,
          lines: [
            { kind: 'heading', text: name },
            { kind: 'bar', slim: true, value: Math.min(1, Math.max(0, completion[name] / 100)), fill: '#00a4dcff' },
          ],
          trail: { kind: 'text', size: 28, text: `${completion[name]}%`, tone: 'strong' },
        })
      )
  },
}

const FAILED = () => $L("That didn't work. Try again in a moment.")
const LOAD_FAILED = () => $L('Could not load this. Check your connection and try again.')
const plural = (count, one, many) => (count === 1 ? one : many.replace('{count}', String(count)))
const unreadLabel = (count) => (count === 0 ? $L('No unread messages') : plural(count, $L('1 unread message'), $L('{count} unread messages')))
const requestLabel = (count) => (count === 0 ? $L('Nothing waiting') : plural(count, $L('1 waiting for you'), $L('{count} waiting for you')))
const mediaTitle = (media) => (media.seriesName ? `${media.seriesName}: ${media.name}` : media.name)
// What a friend is up to: what they watch now, that they're on, what they watched last, when they
// were last here, or nothing.
const friendCaption = (friend) => {
  if (friend.online) return friend.nowPlaying ? fmt($L('Watching {title}'), { title: mediaTitle(friend.nowPlaying) }) : $L('Online')
  if (friend.lastWatched) return fmt($L('Last watched {title}'), { title: mediaTitle(friend.lastWatched) })
  if (friend.lastSeen) return fmt($L('Last seen {time}'), { time: relativeTimeLabel(friend.lastSeen) })
  return $L('Offline')
}
const letterOf = (name) => (name || '?').trim().charAt(0).toUpperCase()

// The friends list and the chats, as the shared state's last read found them.
const social = () => ach.achievements()
const refreshSocial = async (page) => {
  const loaded = await ach.refreshSocial()
  page.refresh()
  return loaded
}

// One write on the plugin, keeping what it said when it refused.
const write = async (page, view, call) => {
  const s = view.s
  s.busy = true
  s.problem = null
  page.refresh()
  const result = await call()
  s.busy = false
  if (!result.ok) s.problem = result.message || FAILED()
  page.refresh()
  return result
}

const personRow = (o) =>
  row({
    sid: o.sid,
    press: o.press || null,
    lead: { kind: 'avatar', letter: letterOf(o.name), online: o.online },
    lines: [{ kind: 'heading', text: o.name }, ...(o.caption ? [{ kind: 'caption', text: o.caption }] : [])],
    trail: o.trail === undefined ? { kind: 'chevron' } : o.trail,
  })

// A question with two answers in place of a dialog, with focus on Cancel.
const confirmBox = (page, view, k, text, label, onConfirm, onCancel, end) => {
  const s = view.s
  if (s.confirmShown !== k) {
    s.confirmShown = k
    page.$setTimeout(() => page.focusList('friends-confirm-cancel'), 0)
  }
  return B.confirmBox(
    k,
    text,
    [
      { sid: 'friends-confirm-cancel', label: $L('Cancel'), press: onCancel },
      { sid: 'friends-confirm-ok', label, press: onConfirm },
    ],
    end
  )
}

const pushView = (page, view, returnFocusTo, params) => go(page, { view, returnFocusTo, params: params || {} })

SCREENS.friends = {
  title: () => $L('Friends'),
  entries: (page, view) => {
    const s = stateOf(page, view)
    const st = social(page)
    if (!s.asked) {
      s.asked = true
      refreshSocial(page).then((loaded) => {
        s.failed = !loaded
        page.refresh()
        settle(page, view)
      })
    }
    const friends = st.friends
    if (!friends) {
      if (s.failed) {
        return loadFailed(
          'failed',
          'friends-retry',
          (pg) => {
            s.failed = false
            s.asked = false
            pg.refresh()
          },
          LOAD_FAILED()
        )
      }
      return [loading()]
    }
    const unread = st.threads.reduce((sum, thread) => sum + thread.unreadCount, 0)
    const out = [navEntry('setting-friends-messages', $L('Messages'), unreadLabel(unread), 'forum', { press: (pg) => pushView(pg, 'friendsMessages', 'setting-friends-messages') })]
    if (!friends.simpleMode) {
      out.push(
        navEntry('setting-friends-requests', $L('Friend requests'), requestLabel(friends.incoming.length), 'group_work', { press: (pg) => pushView(pg, 'friendsRequests', 'setting-friends-requests') })
      )
    }
    out.push(navEntry('setting-friends-add', $L('Add friends'), $L('Find people on this server'), 'person', { press: (pg) => pushView(pg, 'friendsAdd', 'setting-friends-add') }))
    out.push(navEntry('setting-friends-privacy', $L('Privacy'), $L('What your friends can see'), 'privacy_tip', { press: (pg) => pushView(pg, 'friendsPrivacy', 'setting-friends-privacy') }))
    if (!friends.friends.length) out.push(B.message('none', $L('No friends yet. Add people from this server to see them here.')))
    const friendRows = (list) =>
      list.map((friend) =>
        personRow({
          sid: 'friend-' + friend.userId,
          name: friend.userName,
          caption: friendCaption(friend),
          online: friend.online,
          press: (pg) => pushView(pg, 'friendProfile', 'friend-' + friend.userId, { userId: friend.userId, name: friend.userName }),
        })
      )
    const online = friends.friends.filter((friend) => friend.online)
    const offline = friends.friends.filter((friend) => !friend.online)
    if (online.length) out.push(section('online', $L('Online')))
    out.push(...friendRows(online))
    if (offline.length) out.push(section('offline', $L('Offline')))
    out.push(...friendRows(offline))
    return out
  },
}

SCREENS.friendProfile = {
  title: () => null,
  entries: (page, view) => {
    const params = view.params || {}
    const userId = params.userId
    const s = stateOf(page, view)
    const loaded = read(page, view, 'loaded', async () => {
      const [profile, blockedIds] = await Promise.all([achievementsApi.fetchPublicProfile(userId), achievementsApi.fetchBlocked()])
      s.blocked = blockedIds.some((id) => sameUserId(id, userId))
      return { profile }
    })
    const profile = loaded === undefined ? undefined : loaded ? loaded.profile : null
    const blocked = s.blocked === undefined ? null : s.blocked
    const friends = social(page).friends
    const friend = (friends && friends.friends.find((entry) => sameUserId(entry.userId, userId))) || null
    const simpleMode = !!(friends && friends.simpleMode)
    const pending = !!(friends && friends.isPending(userId))
    const playing = friend && friend.online ? friend.nowPlaying : null
    const shownName = (profile && profile.userName) || (friend && friend.userName) || params.name || ''
    const out = [
      B.profileHeader('head', {
        name: shownName,
        letter: letterOf(shownName),
        online: friend ? friend.online : null,
        title: profile && profile.customTitle,
        caption: friend ? friendCaption(friend) : '',
      }),
    ]
    if (profile === undefined) out.push(loading())
    if (profile === null) out.push(B.message('private', fmt($L('{name} keeps their profile private.'), { name: shownName })))
    if (profile) {
      out.push(
        B.statChips('stats', [
          fmt($L('{unlocked} of {total} badges'), { unlocked: profile.unlocked, total: profile.total }),
          fmt($L('{score} points'), { score: profile.score }),
          fmt($L('Best streak: {count} days'), { count: profile.bestWatchStreak }),
        ])
      )
      if (profile.equipped.length) out.push(...showcaseBlocks(view, 'showcase', profile.equipped))
    }
    const cancel = (pg) => {
      s.confirm = null
      s.confirmShown = null
      pg.refresh()
      pg.$setTimeout(() => pg.focusList(null), 0)
    }
    if (s.confirm === 'remove') {
      out.push(
        ...confirmBox(
          page,
          view,
          'remove',
          fmt($L('Remove {name} from your friends? You can add them again later.'), { name: shownName }),
          $L('Remove friend'),
          async (pg) => {
            s.confirm = null
            const result = await write(pg, view, () => achievementsApi.removeFriend(userId))
            if (result.ok) {
              await refreshSocial(pg)
              pg.pop()
            }
          },
          cancel
        )
      )
    }
    if (s.confirm === 'block') {
      out.push(
        ...confirmBox(
          page,
          view,
          'block',
          (blocked ? $L('Unblock {name}?') : $L('Block {name}? Neither of you will be able to message the other directly. Group chats you share stay open.')).replace('{name}', shownName),
          blocked ? $L('Unblock') : $L('Block'),
          async (pg) => {
            s.confirm = null
            const result = await write(pg, view, () => achievementsApi.setBlocked(userId, !blocked))
            if (result.ok) s.blocked = !blocked
            pg.refresh()
          },
          cancel
        )
      )
    }
    if (s.problem) out.push(B.message('problem', s.problem))
    if (!s.confirm && !s.busy) {
      if (friend && !blocked) {
        out.push(
          navEntry('setting-friend-profile-message', $L('Send message'), '', 'forum', {
            press: async (pg) => {
              const conversationId = await achievementsApi.openDirectChat(userId)
              if (conversationId) pushView(pg, 'chat', 'friend-profile-message', { conversationId, name: shownName, isGroup: false })
            },
          })
        )
      }
      if (playing) out.push(navEntry('setting-friend-profile-open', fmt($L('Open {title}'), { title: mediaTitle(playing) }), '', 'play_arrow', { press: (pg) => openItem(pg, playing.id) }))
      const ask = (which) => (pg) => {
        s.confirm = which
        pg.refresh()
      }
      if (!simpleMode && friend) out.push(navEntry('setting-friend-profile-remove', $L('Remove friend'), '', 'group_work', { press: ask('remove') }))
      if (!simpleMode && !friend && !pending && !blocked) {
        out.push(
          navEntry('setting-friend-profile-request', $L('Add as friend'), '', 'person', {
            press: async (pg) => {
              const result = await write(pg, view, () => achievementsApi.sendFriendRequest(userId))
              if (result.ok) refreshSocial(pg)
            },
          })
        )
      }
      if (blocked !== null) out.push(navEntry('setting-friend-profile-block', blocked ? $L('Unblock') : $L('Block'), '', 'gpp_maybe', { press: ask('block') }))
    }
    return out
  },
}

SCREENS.friendsRequests = {
  title: () => $L('Friend requests'),
  entries: (page, view) => {
    const s = stateOf(page, view)
    const friends = social(page).friends
    const incoming = (friends && friends.incoming) || []
    const outgoing = (friends && friends.outgoing) || []
    const act = async (pg, call) => {
      const result = await write(pg, view, call)
      if (result.ok) refreshSocial(pg)
    }
    const out = []
    if (s.problem) out.push(B.message('problem', s.problem))
    if (!incoming.length && !outgoing.length) out.push(B.message('none', $L('No friend requests.')))
    if (incoming.length) out.push(section('incoming', $L('Waiting for you')))
    incoming.forEach((user) => {
      out.push(personRow({ sid: 'request-' + user.userId, name: user.userName, caption: fmt($L('{name} wants to be friends'), { name: user.userName }), trail: null }))
      const bar = B.actionBar(
        'request-bar-' + user.userId,
        [
          { sid: `request-${user.userId}-decline`, label: $L('Decline'), press: (pg) => act(pg, () => achievementsApi.removeFriend(user.userId)) },
          { sid: `request-${user.userId}-accept`, label: $L('Accept'), press: (pg) => act(pg, () => achievementsApi.acceptFriendRequest(user.userId)) },
        ],
        true
      )
      out.push({ ...bar, h: bar.h + 8 })
    })
    if (outgoing.length) out.push(section('outgoing', $L('Sent by you')))
    outgoing.forEach((user) => {
      out.push(
        personRow({
          sid: 'request-' + user.userId,
          name: user.userName,
          caption: $L('Cancel request'),
          press: (pg) => {
            s.cancelling = user.userId
            pg.refresh()
          },
        })
      )
      if (s.cancelling === user.userId) {
        out.push(
          ...confirmBox(
            page,
            view,
            'cancel-' + user.userId,
            fmt($L('Take back the request you sent to {name}?'), { name: user.userName }),
            $L('Cancel request'),
            (pg) => {
              s.cancelling = null
              s.confirmShown = null
              act(pg, () => achievementsApi.removeFriend(user.userId))
            },
            (pg) => {
              s.cancelling = null
              s.confirmShown = null
              pg.refresh()
              pg.$setTimeout(() => pg.focusList('request-' + user.userId), 0)
            }
          )
        )
      }
    })
    return out
  },
}

// The keyboard a field opens, typing straight into the screen's state as it goes.
const typeInto = (s, key) => (pg) =>
  pg.openKeyboard({
    value: s[key] || '',
    purpose: 'text',
    live: (text) => {
      s[key] = text
      pg.refresh()
    },
    done: (text) => {
      s[key] = text
      pg.refresh()
    },
  })

SCREENS.friendsAdd = {
  title: () => $L('Add friends'),
  entries: (page, view) => {
    const s = stateOf(page, view)
    const people = read(page, view, 'people', async () => {
      const list = await achievementsApi.fetchServerUsers()
      return list.filter((person) => !sameUserId(person.userId, getUserId()))
    })
    const friends = social(page).friends
    const needle = (s.query || '').trim().toLowerCase()
    const matches = (people || []).filter((person) => !needle || person.userName.toLowerCase().indexOf(needle) >= 0)
    const out = [B.inputField('search', { sid: 'friends-search-input', value: s.query || '', placeholder: $L('Search people'), press: typeInto(s, 'query') })]
    if (s.sent || s.problem) out.push(B.message('sent', s.problem || s.sent))
    if (people === undefined) out.push(loading())
    else if (!matches.length) out.push(B.message('none', $L('No one matches that name.')))
    matches.forEach((person) => {
      let state = null
      if (friends && friends.isFriend(person.userId)) state = $L('Friends')
      else if (friends && friends.isPending(person.userId)) state = fmt($L('Request sent to {name}'), { name: person.userName })
      out.push(
        personRow({
          sid: 'person-' + person.userId,
          name: person.userName,
          caption: state || $L('Add as friend'),
          press: state
            ? null
            : async (pg) => {
                const result = await write(pg, view, () => achievementsApi.sendFriendRequest(person.userId))
                if (!result.ok) return
                s.sent = fmt($L('Request sent to {name}'), { name: person.userName })
                refreshSocial(pg)
              },
        })
      )
    })
    return out
  },
}

SCREENS.friendsPrivacy = {
  title: () => $L('Privacy'),
  entries: (page, view) => {
    const s = stateOf(page, view)
    const loaded = read(page, view, 'loaded', async () => {
      const [privacy, ids] = await Promise.all([achievementsApi.fetchSocialPrivacy(), achievementsApi.fetchBlocked()])
      s.privacy = privacy
      s.blockedIds = ids
      return true
    })
    const privacy = loaded === undefined ? undefined : s.privacy
    const out = []
    if (privacy === undefined) out.push(loading())
    if (privacy === null) out.push(...loadFailed('failed', 'friends-privacy-retry', (pg) => reread(pg, view, 'loaded'), LOAD_FAILED()))
    const rows = [
      ['appearOffline', $L('Appear offline'), $L('Friends always see you as offline'), 'visibility_off'],
      ['hideNowPlaying', $L("Hide what I'm watching"), $L("Friends still see you online, but not what's playing"), 'hide'],
      ['hideLastWatched', $L('Hide my last watched'), $L("Friends won't see what you watched last while you're offline"), 'history'],
      ['messageNotifications', $L('Message notifications'), $L('Show a banner when a friend messages you'), 'notifications_active'],
    ]
    if (privacy) {
      rows.forEach(([key, title, desc, icon]) =>
        out.push(
          toggleEntry('setting-friends-' + key, title, desc, icon, !!privacy[key], async (pg) => {
            const before = s.privacy
            const next = { ...before, [key]: !before[key] }
            s.privacy = next
            s.problem = null
            pg.refresh()
            if (await achievementsApi.saveSocialPrivacy(next)) {
              if (key === 'messageNotifications') ach.setMessageNotifications(next.messageNotifications)
              return
            }
            s.privacy = before
            s.problem = $L('Could not save your settings.')
            pg.refresh()
          })
        )
      )
    }
    out.push(
      toggleEntry(
        'setting-muteChatBannersDuringPlayback',
        $L('Mute during playback'),
        $L('No message banners while a video or game is playing'),
        'pause_circle',
        settings.get('muteChatBannersDuringPlayback') !== false,
        () => settings.set('muteChatBannersDuringPlayback', settings.get('muteChatBannersDuringPlayback') === false)
      )
    )
    if (s.problem) out.push(B.message('problem', s.problem))
    const blocked = s.blockedIds || []
    if (blocked.length) out.push(section('blocked', $L('Blocked users')))
    blocked.forEach((userId) => {
      const blockedName = ach.displayNameFor(userId) || userId
      out.push(
        personRow({
          sid: 'blocked-' + userId,
          name: blockedName,
          caption: $L('Unblock'),
          press: (pg) => {
            s.unblocking = userId
            pg.refresh()
          },
        })
      )
      if (s.unblocking === userId) {
        out.push(
          ...confirmBox(
            page,
            view,
            'unblock-' + userId,
            fmt($L('Unblock {name}?'), { name: blockedName }),
            $L('Unblock'),
            async (pg) => {
              s.unblocking = null
              s.confirmShown = null
              const result = await write(pg, view, () => achievementsApi.setBlocked(userId, false))
              if (result.ok) s.blockedIds = s.blockedIds.filter((id) => id !== userId)
              pg.refresh()
            },
            (pg) => {
              s.unblocking = null
              s.confirmShown = null
              pg.refresh()
              pg.$setTimeout(() => pg.focusList('blocked-' + userId), 0)
            }
          )
        )
      }
    })
    return out
  },
}

const threadPreview = (thread) => {
  const text = threadIsPhoto(thread) ? $L('Photo') : thread.lastMessage
  return thread.lastFromMe ? fmt($L('You: {text}'), { text }) : text
}

SCREENS.friendsMessages = {
  title: () => $L('Messages'),
  entries: (page, view) => {
    const s = stateOf(page, view)
    if (!s.asked) {
      s.asked = true
      refreshSocial(page)
    }
    const threads = social(page).threads
    const out = [
      navEntry('setting-chat-new', $L('New message'), $L('Start a chat with a friend'), 'forum', { press: (pg) => pushView(pg, 'chatPick', 'setting-chat-new') }),
      navEntry('setting-chat-new-group', $L('New group'), $L('Chat with several friends at once'), 'groups', { press: (pg) => pushView(pg, 'chatNewGroup', 'setting-chat-new-group') }),
    ]
    if (!threads.length) out.push(B.message('none', $L('No messages yet.')))
    threads.forEach((thread) =>
      out.push(
        personRow({
          sid: 'thread-' + thread.conversationId,
          name: thread.name,
          caption: threadPreview(thread),
          trail: thread.unreadCount > 0 ? { kind: 'unread', count: thread.unreadCount } : { kind: 'chevron' },
          press: (pg) => pushView(pg, 'chat', 'thread-' + thread.conversationId, { conversationId: thread.conversationId, name: thread.name, isGroup: thread.isGroup }),
        })
      )
    )
    return out
  },
}

SCREENS.chatPick = {
  title: () => $L('New message'),
  entries: (page, view) => {
    stateOf(page, view)
    const friends = social(page).friends
    const list = (friends && friends.friends) || []
    const out = []
    if (!list.length) out.push(B.message('none', $L('No friends yet. Add people from this server to see them here.')))
    list.forEach((friend) =>
      out.push(
        personRow({
          sid: 'pick-' + friend.userId,
          name: friend.userName,
          caption: friendCaption(friend),
          online: friend.online,
          press: async (pg) => {
            const conversationId = await achievementsApi.openDirectChat(friend.userId)
            if (conversationId) pushView(pg, 'chat', 'pick-' + friend.userId, { conversationId, name: friend.userName, isGroup: false })
          },
        })
      )
    )
    return out
  },
}

// The plugin wants at least two friends besides the user to start a group.
SCREENS.chatNewGroup = {
  title: () => $L('New group'),
  entries: (page, view) => {
    const s = stateOf(page, view)
    const friends = social(page).friends
    const list = (friends && friends.friends) || []
    const picked = s.picked || []
    const out = [
      B.inputField('name', { sid: 'chat-group-name', label: $L('Group name'), value: s.title || '', press: typeInto(s, 'title') }),
      { type: 'text', k: 'pick', text: $L('Pick at least two friends') },
    ]
    list.forEach((friend) =>
      out.push(
        personRow({
          sid: 'group-pick-' + friend.userId,
          name: friend.userName,
          online: friend.online,
          trail: { kind: 'toggle', on: picked.indexOf(friend.userId) >= 0 },
          press: (pg) => {
            const now = s.picked || []
            s.picked = now.indexOf(friend.userId) >= 0 ? now.filter((id) => id !== friend.userId) : [...now, friend.userId]
            pg.refresh()
          },
        })
      )
    )
    if (s.problem) out.push(B.message('problem', s.problem))
    if (picked.length >= 2 && !s.busy) {
      out.push(
        B.actionBar(
          'create',
          [
            {
              sid: 'chat-group-create',
              label: $L('Create group'),
              press: async (pg) => {
                const result = await write(pg, view, () => achievementsApi.createGroup((s.title || '').trim(), s.picked))
                if (!result.ok || !result.value) return
                await refreshSocial(pg)
                pg.pop()
                pushView(pg, 'chat', 'setting-chat-new-group', { conversationId: result.value.id, name: result.value.title || $L('New group'), isGroup: true })
              },
            },
          ],
          false
        )
      )
    }
    return out
  },
}

const loadMessages = async (page, view) => {
  const s = view.s
  const loaded = await achievementsApi.fetchMessages(view.params.conversationId)
  if (view.s !== s) return
  if (loaded) s.messages = loaded
  else if (!s.messages) s.messages = []
  page.refresh()
  settle(page, view)
}

const padded = (block) => ({ ...block, h: block.h + 16, padTop: 8 })

SCREENS.chat = {
  title: (page, view) => (view.params && view.params.name) || '',
  entries: (page, view) => {
    const params = view.params || {}
    const s = stateOf(page, view)
    if (!s.asked) {
      s.asked = true
      // Reading the chat marks it read, so the unread count follows it. It's read again every ten
      // seconds while it's on screen.
      ach.setOpenConversation(params.conversationId)
      loadMessages(page, view).then(() => refreshSocial(page))
      if (view.poll) page.$clearInterval(view.poll)
      view.poll = page.$setInterval(() => {
        if (isTop(page, view) && !document.hidden) loadMessages(page, view)
      }, CHAT_POLL_MS)
    }
    const me = getUserId()
    const mine = (message) => sameUserId(message.fromUserId, me)
    const messages = s.messages
    const lastMine = messages ? [...messages].reverse().find(mine) : null
    const out = []
    if (params.isGroup) {
      out.push(
        navEntry('setting-chat-group-info', $L('Group info'), '', 'groups', {
          press: (pg) => pushView(pg, 'chatGroupInfo', 'setting-chat-group-info', { conversationId: params.conversationId, name: params.name }),
        })
      )
    }
    // shortcut: the messages sit in the list itself rather than in a box that scrolls on its own,
    // so a long chat scrolls the whole screen. Give them a clipped box of their own if
    // long chats feel wrong on the TV.
    if (!messages) out.push(padded(B.message('loading', $L('Loading...'))))
    else if (!messages.length) out.push(padded(B.message('none', $L('No messages yet.'))))
    else {
      messages.forEach((message, i) => {
        const own = mine(message)
        let meta = message.sentAt ? relativeTimeLabel(message.sentAt) : ''
        if (message.editedAt) meta += ` · ${$L('edited')}`
        if (own && message === lastMine) meta += ` · ${message.isRead ? $L('Seen') : $L('Sent')}`
        const last = i === messages.length - 1
        const options = s.options === message.id && s.confirmDelete !== message.id
        const asking = s.confirmDelete === message.id
        // The options and the question sit inside the message's row, before the gap under it.
        const tail = (block) => ({ ...block, h: block.h + 12 + (last ? 8 : 0) })
        // shortcut: a photo shows as its "Photo" line, the way it does while it loads. Draw the image
        // once the renderer is shown to take the blob URL fetchAttachment hands back.
        out.push(
          B.bubble('msg-' + message.id, {
            sid: 'chat-message-' + message.id,
            own,
            first: i === 0,
            last,
            joined: options || asking,
            sender: params.isGroup && !own ? message.fromUserName || ach.displayNameFor(message.fromUserId) || '' : '',
            text: message.text,
            photo: message.attachmentId ? $L('Photo') : '',
            meta,
            press: own
              ? (pg) => {
                  s.options = s.options === message.id ? null : message.id
                  pg.refresh()
                }
              : null,
          })
        )
        if (options) {
          out.push(
            tail(B.actionBar(
              'msg-options',
              [
                {
                  sid: 'chat-message-edit',
                  label: $L('Edit'),
                  press: (pg) => {
                    s.options = null
                    s.editing = message
                    s.text = message.text
                    pg.refresh()
                    pg.$setTimeout(() => pg.focusList('chat-input'), 0)
                  },
                },
                {
                  sid: 'chat-message-delete',
                  label: $L('Delete'),
                  press: (pg) => {
                    s.confirmDelete = message.id
                    pg.refresh()
                  },
                },
              ],
              true,
              true
            ))
          )
        }
        if (asking) {
          const box = confirmBox(
              page,
              view,
              'delete-' + message.id,
              $L('Delete this message for everyone?'),
              $L('Delete'),
              async (pg) => {
                s.confirmDelete = null
                s.confirmShown = null
                s.options = null
                const result = await write(pg, view, () => achievementsApi.deleteMessage(message.id))
                if (result.ok) loadMessages(pg, view)
              },
              (pg) => {
                s.confirmDelete = null
                s.confirmShown = null
                pg.refresh()
                pg.$setTimeout(() => pg.focusList('chat-message-' + message.id), 0)
              },
              true
            )
          out.push(box[0], tail(box[1]))
        }
      })
    }
    if (s.problem) out.push(B.message('problem', s.problem))
    if (s.editing) out.push({ type: 'text', k: 'editing', text: $L('Editing message') })
    const send = async (pg) => {
      const body = (s.text || '').trim()
      if (!body || s.busy) return
      const editing = s.editing
      const result = editing
        ? await write(pg, view, () => achievementsApi.editMessage(editing.id, body))
        : await write(pg, view, () => achievementsApi.sendMessage(params.conversationId, body))
      if (!result.ok) return
      s.text = ''
      s.editing = null
      await loadMessages(pg, view)
      refreshSocial(pg)
      pg.focusList('chat-input')
    }
    out.push(
      B.composer('composer', {
        sid: 'chat-input',
        value: s.text || '',
        placeholder: $L('Write a message'),
        press: (pg) =>
          pg.openKeyboard({
            value: s.text || '',
            purpose: 'text',
            live: (text) => {
              s.text = text
              s.problem = null
              pg.refresh()
            },
            done: (text) => {
              s.text = text
              pg.refresh()
            },
          }),
        buttons: [
          { sid: 'chat-send', label: s.editing ? $L('Save') : $L('Send'), press: send },
          ...(s.editing
            ? [
                {
                  sid: 'chat-edit-cancel',
                  label: $L('Cancel'),
                  press: (pg) => {
                    s.editing = null
                    s.text = ''
                    pg.refresh()
                  },
                },
              ]
            : []),
        ],
      })
    )
    return out
  },
  leave: (page, view) => {
    if (view.poll) page.$clearInterval(view.poll)
    view.poll = null
    ach.setOpenConversation(null)
  },
}

SCREENS.chatGroupInfo = {
  // A group still reading, or one that failed to, shows no title.
  title: (page, view) => (view.s && view.s.group ? $L('Group info') : null),
  entries: (page, view) => {
    const params = view.params || {}
    const s = stateOf(page, view)
    const group = read(page, view, 'group', async () => {
      const loaded = await achievementsApi.fetchConversation(params.conversationId)
      if (loaded) s.title = loaded.title || ''
      return loaded
    })
    if (group === undefined) return [loading()]
    if (!group) return loadFailed('failed', 'chat-group-retry', (pg) => reread(pg, view, 'group'), LOAD_FAILED())
    const me = getUserId()
    const admin = group.isAdmin(me)
    const reload = (pg) =>
      achievementsApi.fetchConversation(params.conversationId).then((next) => {
        s.group = next
        if (next) s.title = next.title || ''
        pg.refresh()
      })
    const act = async (pg, call, after) => {
      const result = await write(pg, view, call)
      if (!result.ok) return
      if (after) after(pg)
      else reload(pg)
    }
    const friendIds = ((social(page).friends && social(page).friends.friends) || []).map((friend) => friend.userId)
    const canAdd = friendIds.some((id) => !group.participantIds.some((member) => sameUserId(member, id)))
    const tagOf = (memberId) => (group.isOwner(memberId) ? $L('Owner') : group.isAdmin(memberId) ? $L('Admin') : null)
    const out = [B.inputField('name', { sid: 'chat-group-rename', label: $L('Group name'), value: s.title || '', disabled: !admin, press: admin ? typeInto(s, 'title') : null })]
    if (admin && (s.title || '').trim() !== (group.title || '')) {
      out.push(
        B.actionBar(
          'rename',
          [
            {
              sid: 'chat-group-rename-save',
              label: $L('Save'),
              press: (pg) =>
                act(
                  pg,
                  () => achievementsApi.renameGroup(params.conversationId, s.title.trim()),
                  (p2) => {
                    refreshSocial(p2)
                    reload(p2)
                  }
                ),
            },
          ],
          false
        )
      )
    }
    if (s.problem) out.push(B.message('problem', s.problem))
    out.push(section('members', plural(group.participantIds.length, $L('1 member'), $L('{count} members'))))
    group.participantIds.forEach((memberId) => {
      const self = sameUserId(memberId, me)
      const memberName = self ? $L('You') : ach.displayNameFor(memberId) || memberId
      const canManage = admin && !self && !group.isOwner(memberId)
      out.push(
        personRow({
          sid: 'member-' + memberId,
          name: memberName,
          caption: tagOf(memberId),
          trail: canManage ? undefined : null,
          press: canManage
            ? (pg) => {
                s.memberMenu = s.memberMenu === memberId ? null : memberId
                pg.refresh()
              }
            : null,
        })
      )
      if (s.memberMenu === memberId) {
        out.push(
          B.actionBar(
            'member-menu',
            [
              {
                sid: `member-${memberId}-admin`,
                label: group.isAdmin(memberId) ? $L('Remove admin') : $L('Make admin'),
                press: (pg) => {
                  s.memberMenu = null
                  act(pg, () => achievementsApi.setGroupAdmin(params.conversationId, memberId, !group.isAdmin(memberId)))
                },
              },
              {
                sid: `member-${memberId}-remove`,
                label: $L('Remove from group'),
                press: (pg) => {
                  s.memberMenu = null
                  act(pg, () => achievementsApi.removeGroupMember(params.conversationId, memberId))
                },
              },
            ],
            true
          )
        )
      }
    })
    const ask = (which) => (pg) => {
      s.confirm = which
      pg.refresh()
    }
    if (admin) {
      out.push(
        navEntry(
          'setting-chat-group-add',
          $L('Add people'),
          canAdd ? '' : $L('No one left to add.'),
          'person',
          canAdd ? { press: (pg) => pushView(pg, 'chatAddMembers', 'setting-chat-group-add', { conversationId: params.conversationId }) } : {}
        )
      )
      out.push(navEntry('setting-chat-group-clear', $L('Clear conversation'), '', 'content_cut', { press: ask('clear') }))
    }
    out.push(navEntry('setting-chat-group-leave', $L('Leave group'), '', 'exit_to_app', { press: ask('leave') }))
    const cancel = (pg) => {
      s.confirm = null
      s.confirmShown = null
      pg.refresh()
    }
    if (s.confirm === 'leave') {
      out.push(
        ...confirmBox(
          page,
          view,
          'leave',
          $L('Leave this group? Someone will have to add you back to rejoin.'),
          $L('Leave group'),
          (pg) => {
            s.confirm = null
            // Out of the group info and the chat it belonged to.
            act(
              pg,
              () => achievementsApi.removeGroupMember(params.conversationId, me),
              async (p2) => {
                await refreshSocial(p2)
                p2.pop()
                p2.pop()
              }
            )
          },
          cancel
        )
      )
    }
    if (s.confirm === 'clear') {
      out.push(
        ...confirmBox(
          page,
          view,
          'clear',
          $L('Delete every message in this chat for everyone in it?'),
          $L('Clear conversation'),
          (pg) => {
            s.confirm = null
            act(
              pg,
              () => achievementsApi.clearConversation(params.conversationId),
              (p2) => {
                refreshSocial(p2)
                p2.pop()
              }
            )
          },
          cancel
        )
      )
    }
    return out
  },
}

// Friends not yet in the group, each a press away from joining it.
SCREENS.chatAddMembers = {
  title: () => $L('Add people'),
  entries: (page, view) => {
    const params = view.params || {}
    const s = stateOf(page, view)
    const group = read(page, view, 'group', () => achievementsApi.fetchConversation(params.conversationId))
    const friends = (social(page).friends && social(page).friends.friends) || []
    const candidates = friends.filter((friend) => group && !group.participantIds.some((member) => sameUserId(member, friend.userId)))
    const out = []
    if (s.problem) out.push(B.message('problem', s.problem))
    if (group && !candidates.length) out.push(B.message('none', $L('No one left to add.')))
    candidates.forEach((friend) =>
      out.push(
        personRow({
          sid: 'add-member-' + friend.userId,
          name: friend.userName,
          online: friend.online,
          press: async (pg) => {
            const result = await write(pg, view, () => achievementsApi.addGroupMember(params.conversationId, friend.userId))
            if (result.ok) pg.pop()
          },
        })
      )
    )
    return out
  },
}
