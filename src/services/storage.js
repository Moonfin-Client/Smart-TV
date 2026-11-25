import {resolvePlatformModule} from './platformModule';

let impl;

const loadImpl = async () => {
	if (impl) return impl;
	impl = await resolvePlatformModule('storage');
	return impl;
};

export const initStorage = async () => {
	const mod = await loadImpl();
	return mod.initStorage();
};

export const getFromStorage = async (...args) => {
	await loadImpl();
	return impl.getFromStorage(...args);
};

export const saveToStorage = async (...args) => {
	await loadImpl();
	return impl.saveToStorage(...args);
};

export const removeFromStorage = async (...args) => {
	await loadImpl();
	return impl.removeFromStorage(...args);
};

export const clearAllStorage = async (...args) => {
	await loadImpl();
	return impl.clearAllStorage(...args);
};
