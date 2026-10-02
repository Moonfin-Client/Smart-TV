import {useSettings} from '../context/SettingsContext';
import {pickedAccent} from '../theme/accentSurfaces';
import {ensureVisible} from '../theme/themeSpec';

/**
 * The accent a person picked for one surface, or `fallback` when they never picked one.
 *
 * A pick that would disappear into the surfaces, black on the dark screens, comes back lifted
 * just far enough to be seen.
 *
 * For the few places that paint an accent through an inline style rather than a stylesheet
 * class, where the stylesheet rules themeOverrides writes can't reach. The fallback is what
 * that place has always used, so nothing shifts until a color is chosen.
 *
 * @param {string} surfaceId - one of the ids in ACCENT_SURFACES
 * @param {string} fallback - the color to keep when there is no pick
 * @returns {string} a hex color
 */
const useSurfaceAccent = (surfaceId, fallback) => {
	const {settings, activeTheme} = useSettings();
	const picked = pickedAccent(settings, surfaceId);
	// A pick that would vanish into the dark screens is nudged until it shows.
	return picked
		? ensureVisible(picked, [activeTheme?.colors?.background, activeTheme?.colors?.surface])
		: fallback;
};

export default useSurfaceAccent;
