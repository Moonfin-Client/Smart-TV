// What the page can ask of the console's own player, and how it hears back. Every
// call names the session the page gave the stream when it opened it, and the host
// drops anything for a session that's no longer the one it has.
import {askShell, onShellMessage, postToShell} from './bridge';

const OPEN_WAIT_MS = 20000;

export const openStream = (session, options) => askShell('PLAYER_OPEN', {session, ...options}, OPEN_WAIT_MS);
export const closeStream = (session) => askShell('PLAYER_CLOSE', {session});
export const play = (session) => postToShell('PLAYER_PLAY', {session});
export const pause = (session) => postToShell('PLAYER_PAUSE', {session});
export const seek = (session, seconds) => postToShell('PLAYER_SEEK', {session, seconds});
export const setVolume = (session, volume, muted) => postToShell('PLAYER_SET_VOLUME', {session, volume, muted});
export const selectAudio = (session, index) => postToShell('PLAYER_SELECT_AUDIO', {session, index});
export const selectSubtitle = (session, index) => postToShell('PLAYER_SELECT_SUBTITLE', {session, index});
export const setRect = (session, rect) => postToShell('PLAYER_SET_RECT', {session, ...rect});
// Where the player is, with the decoders it opened the stream with
export const getState = () => askShell('PLAYER_GET_STATE');

// Calls back with every event the player pushes, and returns the remover.
export const onPlayerEvent = (handler) => onShellMessage('PLAYER_EVENT', handler);
