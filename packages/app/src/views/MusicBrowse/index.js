import {useSettings} from '../../context/SettingsContext';
import MusicBrowse from './MusicBrowse';
import ImmersiveMusic from './ImmersiveMusic';
import QuickAccessMusic from './QuickAccessMusic';

// The music library in the style picked in Settings, swapped as soon as the setting changes. A
// [settingsPreview] draws it in the settings preview, where it takes no focus and leaves the ids
// of the screen and rows under the preview alone.
const MusicLibrary = (props) => {
	const {settings} = useSettings();
	if (settings.musicLibraryStyle === 'classic') return <MusicBrowse {...props} />;
	if (settings.musicLibraryStyle === 'quickAccess') return <QuickAccessMusic {...props} />;
	return <ImmersiveMusic {...props} />;
};

export default MusicLibrary;
