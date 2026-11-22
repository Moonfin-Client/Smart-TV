import {isXbox} from '../platform';

// Silo's sockets (events, Watch Party rooms). Silo refuses a handshake whose Origin is a web origin other than its
// own. webOS and Tizen send null or file://, which it takes; Xbox's WebView sends http://moonfin.internal, so there the
// shell opens the socket, and a native socket sends no Origin.
export const openSiloSocket = async (url, protocols) => {
	if (!isXbox()) return new WebSocket(url, protocols);
	const {ShellSocket} = await import('@moonfin/platform-xbox/socket');
	return new ShellSocket(url, protocols);
};
