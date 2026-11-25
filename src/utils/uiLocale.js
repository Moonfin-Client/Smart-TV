import {currentLocale} from '../services/i18n.js';

// Moonfin's interface language, which dates and amounts follow. Formatting without a locale goes
// by the TV's own language instead.
export const uiLocale = () => currentLocale();
