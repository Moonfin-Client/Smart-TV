import {createServerSeek} from './serverSeek';

describe('createServerSeek', () => {
	it('serves the first seek and then only the latest of those asked for meanwhile', async () => {
		const served = [];
		let release;
		const seek = createServerSeek(async (ticks) => {
			served.push(ticks);
			if (served.length === 1) await new Promise((resolve) => { release = resolve; });
		});
		const first = seek(1);
		seek(2);
		seek(3);
		release();
		await first;
		expect(served).toEqual([1, 3]);
	});

	it('serves again after a failed seek', async () => {
		const served = [];
		const seek = createServerSeek(async (ticks) => {
			served.push(ticks);
			if (ticks === 1) throw new Error('refused');
		});
		await expect(seek(1)).rejects.toThrow('refused');
		await seek(2);
		expect(served).toEqual([1, 2]);
	});
});
