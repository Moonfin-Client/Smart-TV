// A Fire TV stick has no volume of its own. The remote drives the TV over HDMI
// CEC, so there is nothing here to read or set.

export const getVolumeState = async () => null;

export const setVolume = async () => false;

export const setMuted = async () => false;
