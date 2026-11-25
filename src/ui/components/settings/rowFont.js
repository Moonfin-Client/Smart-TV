import { sdfSafe, uiUsesSdf } from '../../text.js'

// Settings rows stay in Roboto under a theme with a face of its own, so the list, its blocks and
// its dialogs pick their faces here rather than with fontFor.
const ROBOTO = { regular: ['roboto', 'roboto-web'], medium: ['roboto-medium', 'roboto-medium-web'], bold: ['roboto-bold', 'roboto-bold-web'] }
export const rowFont = (str, weight = 'regular') => ROBOTO[weight][sdfSafe(str) ? 0 : 1]
export const rowUiFont = (weight = 'regular') => ROBOTO[weight][uiUsesSdf() ? 0 : 1]
