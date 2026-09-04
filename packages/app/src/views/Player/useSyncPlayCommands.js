import {useEffect, useRef} from 'react';
import * as syncPlayService from '../../services/syncPlay';

// Runs each SyncPlay command once, at the time the server set for it. The
// player supplies only its platform-specific `execute(command, delay)`.
//
// Whatever command was pending when the player mounted has already had its
// effect. Joining an idle group gets a Stop, and replaying that here on the
// next mount would close the player the moment the group starts something.
//
// The timer lives on a ref rather than in an effect cleanup, so a re-render
// between a command arriving and its time can't drop it; only a newer command
// supersedes one still waiting.
const useSyncPlayCommands = ({lastCommand, isReady, execute, onStop}) => {
	const lastProcessedRef = useRef(lastCommand);
	const timerRef = useRef(null);
	const handlersRef = useRef(null);
	handlersRef.current = {isReady, execute, onStop};

	useEffect(() => {
		if (!lastCommand || !handlersRef.current.isReady()) return;
		if (lastCommand === lastProcessedRef.current) return;
		lastProcessedRef.current = lastCommand;

		clearTimeout(timerRef.current);
		timerRef.current = null;

		if (lastCommand.Command === 'Stop') {
			handlersRef.current.onStop();
			return;
		}

		const delay = syncPlayService.getDelayToWhen(lastCommand.When);
		const run = () => {
			timerRef.current = null;
			handlersRef.current.execute(lastCommand, delay);
		};
		if (delay > 50) {
			timerRef.current = setTimeout(run, delay);
		} else {
			run();
		}
	}, [lastCommand]);

	useEffect(() => () => clearTimeout(timerRef.current), []);
};

export default useSyncPlayCommands;
