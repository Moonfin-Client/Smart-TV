import {copyBufferSeconds} from './copyBuffer';

describe('copyBufferSeconds', () => {
	it('holds a 4K remux at its bitrate to the byte budget', () => {
		// 66.5 Mbps: about 12 s fits.
		expect(copyBufferSeconds(66572000)).toEqual({ahead: 9, behind: 3});
	});

	it('keeps the usual 30 s each way for a lighter stream or an unknown bitrate', () => {
		expect(copyBufferSeconds(4000000)).toEqual({ahead: 30, behind: 30});
		expect(copyBufferSeconds(undefined)).toEqual({ahead: 30, behind: 30});
	});

	it('never goes below a floor that still rides out a slow fragment', () => {
		expect(copyBufferSeconds(400000000)).toEqual({ahead: 6, behind: 2});
	});
});
