import $L from '@enact/i18n/$L';
import {SILO_PLAYBACK_ENDED_ON_SERVER, SILO_PLAYBACK_UNAVAILABLE, SILO_PLAYBACK_UPGRADE_REQUIRED} from '../../services/siloPlayback';

// What a title that failed to load says. Silo's fixed refusals are put in the viewer's language; anything else (a
// refusal Silo worded itself, another server's error) is shown as it came.
const playbackErrorMessage = (err) => {
	switch (err?.message) {
		case SILO_PLAYBACK_UNAVAILABLE: return $L("Playback isn't available on this Silo server.");
		case SILO_PLAYBACK_UPGRADE_REQUIRED: return $L('This Silo server needs a newer version of Moonfin to play.');
		case SILO_PLAYBACK_ENDED_ON_SERVER: return $L('Playback was ended on the Silo server.');
		default: return err?.message || $L('Failed to load media');
	}
};

export default playbackErrorMessage;
