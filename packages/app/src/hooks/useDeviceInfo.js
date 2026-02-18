import {useState, useEffect} from 'react';
import {getDeviceCapabilities} from '../services/deviceProfile';

export function useDeviceInfo() {
	const [capabilities, setCapabilities] = useState(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		getDeviceCapabilities().then((caps) => {
			setCapabilities(caps);
			setIsLoading(false);
		});
	}, []);

	return {capabilities, isLoading};
}

export default useDeviceInfo;
