// Turns schema rows into the entries layoutRows lays out, each with its padding, text layout and
// trailing part. Each entry keeps its schema row so a press can act on it.
import { KIND, resolve, spotlightIdOf } from './settingsSchema.js'
import { getChipLabel } from './settingsOptions.js'
import { relativeLuminance } from '../../theme/themeSpec.js'
import { lc } from '../../ui/theme.js'

// A color in any CSS-ish form ('#rgb', '#rrggbb', '#aarrggbb') as the renderer's '#rrggbbaa'.
export const toLightning = (color) => {
  if (!color || typeof color !== 'string') return '#00000000'
  let v = color.trim().replace('#', '')
  if (v.length === 3) v = v.split('').map((c) => c + c).join('')
  if (v.length === 6) return '#' + v.toLowerCase() + 'ff'
  if (v.length === 8) return lc('#' + v)
  return '#00000000'
}

// A navbar swatch gets a dark ring when it's nearly white and a faint onSurface one otherwise.
export const swatchEdge = (color, p) => {
  try {
    const v = String(color).replace('#', '')
    const hex = v.length === 8 ? '#' + v : '#FF' + (v.length === 3 ? v.split('').map((c) => c + c).join('') : v)
    return relativeLuminance(hex) > 0.8 ? '#00000061' : p.os(0.24)
  } catch (e) {
    return p.os(0.24)
  }
}

const text = (value, ctx) => {
  const out = resolve(value, ctx)
  return out == null ? '' : out
}

// A nav row: not tight, the description as a caption, a chevron unless told otherwise.
export const navEntry = (sid, title, desc, icon, extra) => ({
  type: 'card',
  sid,
  title,
  sub: desc || '',
  subTone: 'caption',
  icon,
  iconStyle: 'tile',
  trail: 'chevron',
  ...extra,
})

// A switch row: tight, the description under the title, a toggle on the end.
export const toggleEntry = (sid, title, desc, icon, on, press) => ({ type: 'card', sid, tight: true, title, sub: desc, subTone: 'desc', icon, iconStyle: 'strong', trail: 'toggle', on, press })

const rowEntry = (row, ctx, p, custom) => {
  if (!row || (row.when && !row.when(ctx))) return null
  const s = ctx.settings
  switch (row.kind) {
    case KIND.SECTION:
      return { type: 'section', k: 'section-' + row.id, text: text(row.label, ctx) }
    case KIND.DIVIDER:
      return { type: 'divider', k: 'divider-' + (row.id || '') }
    case KIND.TEXT:
      return { type: 'text', k: 'text-' + row.id, text: text(row.text, ctx) }
    case KIND.TOGGLE:
      return {
        type: 'card',
        sid: spotlightIdOf(row),
        row,
        tight: true,
        title: text(row.label, ctx),
        sub: text(row.desc, ctx),
        subTone: 'desc',
        icon: text(row.icon, ctx),
        iconStyle: 'strong',
        trail: 'toggle',
        on: !!(row.isOn ? row.isOn(ctx) : s[row.key]),
      }
    case KIND.OPTION: {
      const options = row.options(ctx)
      const value = row.value ? row.value(ctx) : s[row.key]
      const caption = getChipLabel(options, value, text(row.fallback, ctx))
      const base = { type: 'card', sid: spotlightIdOf(row), row, title: text(row.label, ctx), icon: text(row.icon, ctx) }
      if (row.colorTile) {
        const color = row.colorTile(ctx)
        return { ...base, iconStyle: 'plain', trail: 'circle', swatch: toLightning(color), swatchEdge: p.swatchRing }
      }
      if (row.swatch || row.valueAsSubtitle) {
        const color = row.swatch ? row.swatch(ctx) : null
        return {
          ...base,
          iconStyle: 'tile',
          sub: caption,
          subTone: 'caption',
          trail: color ? 'swatch' : 'chevron',
          swatch: color ? toLightning(color) : null,
          swatchEdge: color ? swatchEdge(color, p) : null,
        }
      }
      const desc = text(row.desc, ctx)
      return {
        ...base,
        tight: !row.padded,
        three: !!desc,
        sub: desc,
        subTone: 'desc',
        iconStyle: row.plainIcon ? 'plain' : 'tile',
        trail: 'bubble',
        bubble: caption,
      }
    }
    case KIND.SLIDER: {
      const value = s[row.key]
      return {
        type: 'card',
        sid: spotlightIdOf(row),
        row,
        shape: 'slider',
        title: text(row.label, ctx),
        sub: text(row.desc, ctx),
        subTone: 'caption',
        icon: text(row.icon, ctx),
        iconStyle: row.plainIcon ? 'plain' : 'tile',
        trail: 'none',
        min: row.min,
        max: row.max,
        step: row.step,
        value,
        valueText: String(row.format ? row.format(value) : value),
      }
    }
    case KIND.NAV:
      if (row.bubble) {
        const desc = text(row.desc, ctx)
        return {
          type: 'card',
          sid: spotlightIdOf(row),
          row,
          title: text(row.label, ctx),
          three: !!desc,
          sub: desc,
          subTone: 'desc',
          icon: text(row.icon, ctx),
          iconStyle: 'tile',
          trail: 'bubble',
          bubble: text(row.bubble, ctx),
        }
      }
      return navEntry(spotlightIdOf(row), text(row.label, ctx), text(row.desc, ctx), text(row.icon, ctx), {
        row,
        trail: row.chevron === false ? 'none' : 'chevron',
      })
    case KIND.INFO:
      return {
        type: 'card',
        sid: spotlightIdOf(row),
        row,
        title: text(row.label, ctx),
        sub: text(row.value, ctx),
        subTone: 'caption',
        icon: text(row.icon, ctx),
        iconStyle: 'tile',
        trail: 'empty',
      }
    case KIND.CUSTOM:
      return custom ? custom(row, ctx) : null
    default:
      return null
  }
}

// Every row of a screen, custom ones expanded, with nulls dropped.
export const screenEntries = (rows, ctx, p, custom) => {
  const out = []
  ;(rows || []).forEach((row) => {
    const e = rowEntry(row, ctx, p, custom)
    if (Array.isArray(e)) e.forEach((x) => x && out.push(x))
    else if (e) out.push(e)
  })
  return out
}
