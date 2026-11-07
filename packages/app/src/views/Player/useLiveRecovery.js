import {useEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import * as playback from '../../services/playback';
import serverLogger from '../../services/serverLogger';
import {createLiveRecovery} from './liveRecovery';

const STOP_REPORT_WAIT_MS = 3000;

/**
 * Gives the channel back and asks the server for it again on the route an attempt picked,
 * once the player has torn its stream down.
 *
 * @param {Object} channel
 * @param {Object} channel.item
 * @param {string} channel.mediaSourceId
 * @param {number} channel.maxBitrate
 * @param {boolean} channel.stereoUpmixEnabled
 * @param {boolean} channel.directAllowed - false under Force Transcode or Prefer Transcoding
 * @param {boolean} channel.wasDirectPlay
 * @param {number} channel.positionTicks
 * @param {{disableDirectPlay: boolean, forceTranscode: boolean}} route
 * @returns {Promise<Object>} the PlaybackInfo result
 */
export const reopenLiveChannel = async (channel, {disableDirectPlay, forceTranscode}) => {
	// The stop report frees the tuner and ends the server's job, and direct play has no job to wait on.
	const stopReport = playback.reportStop(channel.positionTicks);
	if (!channel.wasDirectPlay) {
		await Promise.race([stopReport, new Promise((resolve) => setTimeout(resolve, STOP_REPORT_WAIT_MS))]);
	}
	return playback.getPlaybackInfo(channel.item.Id, {
		startPositionTicks: 0,
		maxBitrate: channel.maxBitrate,
		enableDirectPlay: channel.directAllowed && !disableDirectPlay && !forceTranscode,
		enableDirectStream: channel.directAllowed && !forceTranscode,
		enableTranscoding: true,
		mediaSourceId: channel.mediaSourceId,
		item: channel.item,
		isLiveTV: true,
		stereoUpmixEnabled: channel.stereoUpmixEnabled
	});
};

/**
 * The live recovery for a player, kept for as long as the player is up.
 *
 * @param {Object} options
 * @param {boolean} options.isLiveTV
 * @param {string} options.itemId - moving to another channel abandons whatever is under way
 * @param {Function} options.reResolve - see createLiveRecovery
 * @param {Function} [options.reload] - see createLiveRecovery
 * @param {Function} options.release - see createLiveRecovery
 * @param {Function} options.onLost - see createLiveRecovery
 * @param {Function} options.isDirectPlay - see createLiveRecovery
 * @returns {{recovery: Object|null, reconnecting: string|null}} the recovery, null off live TV,
 *   and the reconnecting label while an attempt is under way
 */
const useLiveRecovery = ({isLiveTV, itemId, reResolve, reload, release, onLost, isDirectPlay}) => {
	const [status, setStatus] = useState(null);
	const handlers = useRef(null);
	handlers.current = {reResolve, reload, release, onLost, isDirectPlay};
	const recoveryRef = useRef(null);
	if (!recoveryRef.current) {
		recoveryRef.current = createLiveRecovery({
			reResolve: (route) => handlers.current.reResolve(route),
			reload: reload ? () => handlers.current.reload() : null,
			release: () => handlers.current.release(),
			onLost: () => handlers.current.onLost(),
			isDirectPlay: () => handlers.current.isDirectPlay(),
			onStatus: setStatus,
			log: (message) => serverLogger.playback(message)
		});
	}

	useEffect(() => () => recoveryRef.current.abandon('the viewer left the channel'), [itemId]);

	const reconnecting = isLiveTV && status
		? $L('Reconnecting… ({attempt} of {total})')
			.replace('{attempt}', status.attempt)
			.replace('{total}', status.maxAttempts)
		: null;

	return {recovery: isLiveTV ? recoveryRef.current : null, reconnecting};
};

export default useLiveRecovery;
