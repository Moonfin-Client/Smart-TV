// The full icon map is large, so outside Settings it loads the first time something needs an icon
// the server picked by name, rather than with the app.
let paths = null;
let loading = null;

export const loadCoreIconPaths = () => {
	if (!loading) {
		loading = import('../views/Settings/settingsCoreIcons').then((icons) => {
			paths = icons.CORE_ICON_PATHS;
		});
	}
	return loading;
};

export const coreIconPath = (name) => (paths ? paths[name] : undefined);
