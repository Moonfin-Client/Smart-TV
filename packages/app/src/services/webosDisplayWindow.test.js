import {initLunaAPI, setDisplayWindow} from '../../../platform-webos/src/video';

const mockCalls = [];
let mockReplies = [];

jest.mock('@enact/webos/LS2Request', () => ({
	__esModule: true,
	default: class {
		send ({service, method, parameters, onSuccess, onFailure}) {
			mockCalls.push({uri: `${service}/${method}`, parameters});
			const reply = mockReplies.shift() || {returnValue: true};
			if (reply.errorCode) onFailure(reply);
			else onSuccess(reply);
		}
	}
}));

jest.mock('@moonfin/app/src/services/serverLogger', () => ({
	__esModule: true,
	default: {playback: jest.fn()}
}));

const OLD_WEBOS = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.122 Safari/537.36 WebAppManager';
const WEBOS_25 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.270 Safari/537.36 WebAppManager';
let userAgent = OLD_WEBOS;
Object.defineProperty(window.navigator, 'userAgent', {get: () => userAgent, configurable: true});

const WINDOW = {x: 0, y: 0, width: 1280, height: 536, destX: 0, destY: 0, destWidth: 1920, destHeight: 1080};

const makeVideo = () => {
	const video = document.createElement('video');
	Object.defineProperty(video, 'videoWidth', {value: 1280});
	Object.defineProperty(video, 'videoHeight', {value: 536});
	video.mediaId = 'pipeline-1';
	return video;
};

describe('the webOS zoom window', () => {
	beforeAll(() => initLunaAPI());

	beforeEach(() => {
		jest.useFakeTimers();
		userAgent = OLD_WEBOS;
		mockCalls.length = 0;
		mockReplies = [];
	});

	afterEach(async () => {
		userAgent = OLD_WEBOS;
		await setDisplayWindow({...WINDOW, mode: 'fit', video: document.createElement('video')});
		jest.useRealTimers();
	});

	test('Fit leaves the TV alone', async () => {
		const video = makeVideo();
		await setDisplayWindow({...WINDOW, mode: 'fit', video});
		await jest.advanceTimersByTimeAsync(5000);
		expect(mockCalls).toHaveLength(0);
	});

	test('Stretch waits for the pipeline, hands the TV a source the screen\'s shape and keeps it there', async () => {
		const video = makeVideo();
		mockReplies = [{errorCode: 53}];
		await setDisplayWindow({...WINDOW, mode: 'stretch', video});
		await jest.advanceTimersByTimeAsync(500);

		expect(mockCalls).toHaveLength(2);
		const {uri, parameters} = mockCalls[1];
		expect(uri).toBe('luna://com.webos.service.videooutput/display/setDisplayWindow');
		expect(parameters.context).toBe('pipeline-1');
		expect(parameters.originalInput).toEqual({x: 0, y: 0, width: 1280, height: 720});
		expect(parameters.sourceInput).toEqual({x: 0, y: 0, width: 1280, height: 720});
		expect(parameters.displayOutput).toEqual({x: 0, y: 0, width: 1920, height: 1080});

		await jest.advanceTimersByTimeAsync(3000);
		expect(mockCalls).toHaveLength(3);
		video.dispatchEvent(new Event('playing'));
		await jest.advanceTimersByTimeAsync(0);
		expect(mockCalls).toHaveLength(4);
	});

	test('leaving Stretch hands the TV the new window once and then stops', async () => {
		const video = makeVideo();
		await setDisplayWindow({...WINDOW, mode: 'stretch', video});
		await jest.advanceTimersByTimeAsync(0);
		await setDisplayWindow({...WINDOW, destY: 137, destHeight: 805, mode: 'fit', video});
		await jest.advanceTimersByTimeAsync(0);

		expect(mockCalls).toHaveLength(2);
		expect(mockCalls[1].parameters.originalInput).toEqual({x: 0, y: 0, width: 1280, height: 536});
		expect(mockCalls[1].parameters.displayOutput).toEqual({x: 0, y: 137, width: 1920, height: 805});

		await jest.advanceTimersByTimeAsync(60000);
		video.dispatchEvent(new Event('playing'));
		await jest.advanceTimersByTimeAsync(0);
		expect(mockCalls).toHaveLength(2);
	});

	test('a set that refuses the window is left to the element\'s box', async () => {
		const video = makeVideo();
		mockReplies = Array.from({length: 10}, () => ({errorCode: -1}));
		await setDisplayWindow({...WINDOW, mode: 'stretch', video});
		await jest.advanceTimersByTimeAsync(60000);
		expect(mockCalls).toHaveLength(5);
	});

	test('webOS 6 and later stretch through the element\'s box alone', async () => {
		userAgent = WEBOS_25;
		await setDisplayWindow({...WINDOW, mode: 'stretch', video: makeVideo()});
		await jest.advanceTimersByTimeAsync(5000);
		expect(mockCalls).toHaveLength(0);
	});
});
