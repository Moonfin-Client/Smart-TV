import { getPerfTier, smoothScrollingFor } from '../../../utils/perfTier.js'
import * as settings from '../../../state/settings.js'

export const focusMs = (ms = 200) => (getPerfTier() === 'high' ? ms : 0)
export const slideMs = (ms = 200) => (smoothScrollingFor(settings.get('smoothScrollingChoice')) ? ms : 0)
