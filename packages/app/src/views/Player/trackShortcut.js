// What the remote's Subtitles, Audio and Record buttons do in the player. A second press closes
// what the first opened, and a first press opens what the OSD button would, as long as no other
// dialog is up. Null leaves the key alone.
export const trackShortcutAction = (shortcut, {activeModal, hasSubtitles, audioTrackCount, recordable}) => {
	if (shortcut !== 'subtitle' && shortcut !== 'audio' && shortcut !== 'record') return null;
	// The slot chooser, the second track and the download and timing dialogs all open from Subtitles.
	const owns = shortcut === 'subtitle'
		? Boolean(activeModal) && activeModal.toLowerCase().indexOf('subtitle') >= 0
		: activeModal === shortcut;
	if (owns) return 'close';
	if (activeModal) return 'ignore';
	if (shortcut === 'subtitle') return hasSubtitles ? 'open' : 'ignore';
	if (shortcut === 'audio') return audioTrackCount > 0 ? 'open' : 'ignore';
	return recordable ? 'open' : 'ignore';
};
