import {useCallback, useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {getUserImageUrl} from '../services/jellyfinApi';

// The signed in user's avatar. Falls back to the initial when there's no
// picture, or when the server has a tag on record but the image won't load.
export function useUserAvatar() {
	const {user, serverUrl, serverType} = useAuth();
	const [failed, setFailed] = useState(false);

	const onError = useCallback(() => setFailed(true), []);

	const avatarUrl = user?.PrimaryImageTag && !failed
		? getUserImageUrl(serverUrl, user.Id, user.PrimaryImageTag, serverType)
		: null;

	return {user, avatarUrl, initial: user?.Name?.[0] || 'U', onError};
}

export default useUserAvatar;
