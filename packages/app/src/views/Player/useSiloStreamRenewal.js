import {useEffect} from 'react';

import * as playback from '../../services/playback';

const CHECK_MS = 15000;

// Reopens a Silo stream at the same place once the session has moved to a new token, so playback outlives the token
// it started on. A paused stream asks nothing of the server, so it's checked again the moment it resumes.
const useSiloStreamRenewal = (paused, reopen) => {
	useEffect(() => {
		if (paused) return undefined;
		const check = () => {
			if (playback.siloStreamTokenRenewed()) reopen();
		};
		check();
		const timer = setInterval(check, CHECK_MS);
		return () => clearInterval(timer);
	}, [paused, reopen]);
};

export default useSiloStreamRenewal;
