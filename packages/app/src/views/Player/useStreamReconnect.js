import {useEffect, useRef, useState} from 'react';
import $L from '@enact/i18n/$L';
import serverLogger from '../../services/serverLogger';
import {createStreamReconnect} from './streamReconnect';

// One reconnect per item: a new item (next, previous, auto-advance) ends the last one's, so its errors and budget
// aren't taken for the new item's. `reopen` and `onLost` are read when they're needed.
const useStreamReconnect = ({itemId, reopen, onLost}) => {
	const [reconnecting, setReconnecting] = useState(false);
	const handlers = useRef({reopen, onLost});
	handlers.current = {reopen, onLost};
	const reconnectRef = useRef(null);
	if (!reconnectRef.current) {
		reconnectRef.current = createStreamReconnect({
			reopen: () => handlers.current.reopen(),
			onLost: () => handlers.current.onLost(),
			onReconnecting: setReconnecting,
			log: (message) => serverLogger.playback(`[Reconnect] ${message}`)
		});
	}

	useEffect(() => () => reconnectRef.current.end(), [itemId]);

	return {reconnect: reconnectRef.current, reconnectingLabel: reconnecting ? $L('Reconnecting...') : null};
};

export default useStreamReconnect;
