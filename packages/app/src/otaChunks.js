/* global __webpack_require__ */
// When the shell's OTA loader booted this bundle from IndexedDB, its lazy chunks
// come from there too, so they match main.js and need no network.
const ota = typeof window !== 'undefined' && window.__moonfinOta;

if (ota && ota.read) {
	__webpack_require__.l = (url, done) => {
		ota.read(url).then(text => {
			const script = document.createElement('script');
			script.text = text;
			document.head.appendChild(script);
			document.head.removeChild(script);
			done({type: 'load', target: {src: url}});
		}, () => done({type: 'error', target: {src: url}}));
	};

	// mini-css-extract skips any chunk whose <style data-href> is already in the page.
	const loadCss = __webpack_require__.f && __webpack_require__.f.miniCss;
	if (loadCss) {
		__webpack_require__.f.miniCss = (chunkId, promises) => {
			const name = __webpack_require__.miniCssF(chunkId);
			if (document.querySelector(`style[data-href="${name}"]`)) {
				loadCss(chunkId, promises);
				return;
			}
			promises.push(ota.read(name).then(css => {
				const style = document.createElement('style');
				style.setAttribute('data-href', name);
				style.textContent = css;
				document.head.appendChild(style);
			}, () => {}).then(() => {
				const inner = [];
				loadCss(chunkId, inner);
				return Promise.all(inner);
			}));
		};
	}
}
