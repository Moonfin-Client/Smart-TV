/* global localStorage */
let LS2Request = null;

const loadLS2Request = async () => {
	if (LS2Request) return LS2Request;
	try {
		const webos = await import('@enact/webos/LS2Request');
		LS2Request = webos.default;
		return LS2Request;
	} catch (e) {
		return null;
	}
};

const DB_KIND = 'org.moonfin.webos:1';
let storageInitialized = false;

export const initStorage = async () => {
	if (storageInitialized) return true;

	const LS2 = await loadLS2Request();
	if (!LS2) {
		storageInitialized = true;
		return true;
	}

	return new Promise((resolve) => {
		new LS2().send({
			service: 'luna://com.webos.service.db',
			method: 'putKind',
			parameters: {
				id: DB_KIND,
				owner: 'org.moonfin.webos',
				indexes: [{name: 'key', props: [{name: 'key'}]}]
			},
			onSuccess: () => {
				storageInitialized = true;
				resolve(true);
			},
			onFailure: () => {
				storageInitialized = true;
				resolve(true);
			}
		});
	});
};

export const getFromStorage = async (key) => {
	const LS2 = await loadLS2Request();

	if (!LS2) {
		try {
			const item = localStorage.getItem(`moonfin_${key}`);
			return item ? JSON.parse(item) : null;
		} catch (e) {
			return null;
		}
	}

	return new Promise((resolve) => {
		new LS2().send({
			service: 'luna://com.webos.service.db',
			method: 'find',
			parameters: {
				query: {
					from: DB_KIND,
					where: [{prop: 'key', op: '=', val: key}]
				}
			},
			onSuccess: (res) => {
				if (res.results && res.results.length > 0) {
					resolve(res.results[0].value);
				} else {
					resolve(null);
				}
			},
			onFailure: () => resolve(null)
		});
	});
};

export const saveToStorage = async (key, value) => {
	const LS2 = await loadLS2Request();

	if (!LS2) {
		try {
			localStorage.setItem(`moonfin_${key}`, JSON.stringify(value));
			return true;
		} catch (e) {
			return false;
		}
	}

	return new Promise((resolve, reject) => {
		new LS2().send({
			service: 'luna://com.webos.service.db',
			method: 'del',
			parameters: {
				query: {
					from: DB_KIND,
					where: [{prop: 'key', op: '=', val: key}]
				}
			},
			onSuccess: () => {
				new LS2().send({
					service: 'luna://com.webos.service.db',
					method: 'put',
					parameters: {
						objects: [{
							_kind: DB_KIND,
							key: key,
							value: value
						}]
					},
					onSuccess: () => resolve(true),
					onFailure: reject
				});
			},
			onFailure: () => {
				new LS2().send({
					service: 'luna://com.webos.service.db',
					method: 'put',
					parameters: {
						objects: [{
							_kind: DB_KIND,
							key: key,
							value: value
						}]
					},
					onSuccess: () => resolve(true),
					onFailure: reject
				});
			}
		});
	});
};

export const removeFromStorage = async (key) => {
	const LS2 = await loadLS2Request();

	if (!LS2) {
		try {
			localStorage.removeItem(`moonfin_${key}`);
			return true;
		} catch (e) {
			return false;
		}
	}

	return new Promise((resolve) => {
		new LS2().send({
			service: 'luna://com.webos.service.db',
			method: 'del',
			parameters: {
				query: {
					from: DB_KIND,
					where: [{prop: 'key', op: '=', val: key}]
				}
			},
			onSuccess: resolve,
			onFailure: resolve
		});
	});
};
