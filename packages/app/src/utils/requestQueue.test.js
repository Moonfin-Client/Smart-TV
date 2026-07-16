import {createRequestQueue, DEFAULT_MAX_CONCURRENT, mediaServerQueue} from './requestQueue';

const deferred = () => {
	let resolve, reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return {promise, resolve, reject};
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createRequestQueue', () => {
	test('never exceeds the concurrency limit', async () => {
		const queue = createRequestQueue(2);
		let running = 0;
		let peak = 0;
		const gates = [deferred(), deferred(), deferred(), deferred()];

		const runs = gates.map((gate) => queue.run(async () => {
			running++;
			peak = Math.max(peak, running);
			await gate.promise;
			running--;
		}));

		await flush();
		expect(peak).toBe(2);
		expect(queue.inFlight()).toBe(2);
		expect(queue.pending()).toBe(2);

		gates.forEach((gate) => gate.resolve());
		await Promise.all(runs);
		expect(peak).toBe(2);
	});

	test('a finished task lets the next one start', async () => {
		const queue = createRequestQueue(1);
		const order = [];
		const first = deferred();

		const a = queue.run(async () => {
			order.push('a-start');
			await first.promise;
			order.push('a-end');
		});
		const b = queue.run(async () => {
			order.push('b-start');
		});

		await flush();
		expect(order).toEqual(['a-start']);

		first.resolve();
		await Promise.all([a, b]);
		expect(order).toEqual(['a-start', 'a-end', 'b-start']);
	});

	test('drains every queued task', async () => {
		const queue = createRequestQueue(3);
		const results = await Promise.all(
			Array.from({length: 25}, (_, i) => queue.run(async () => i * 2))
		);
		expect(results).toHaveLength(25);
		expect(results[24]).toBe(48);
		expect(queue.inFlight()).toBe(0);
		expect(queue.pending()).toBe(0);
	});

	test('a rejected task rejects its caller without wedging the queue', async () => {
		const queue = createRequestQueue(1);
		await expect(queue.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
		await expect(queue.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
		expect(queue.inFlight()).toBe(0);
	});

	test('a task that throws synchronously does not wedge the queue', async () => {
		const queue = createRequestQueue(1);
		await expect(queue.run(() => {
			throw new Error('sync boom');
		})).rejects.toThrow('sync boom');
		await expect(queue.run(() => Promise.resolve('still works'))).resolves.toBe('still works');
	});

	test('treats a limit below 1 as 1 rather than deadlocking', async () => {
		const queue = createRequestQueue(0);
		await expect(queue.run(() => Promise.resolve('ran'))).resolves.toBe('ran');
	});

	test('ships a default limit that leaves room for image loads', () => {
		expect(DEFAULT_MAX_CONCURRENT).toBeGreaterThan(0);
		expect(DEFAULT_MAX_CONCURRENT).toBeLessThanOrEqual(6);
	});
});

describe('mediaServerQueue', () => {
	// A queue per service would let through as many bursts as there are services.
	test('holds every caller to one shared cap', async () => {
		let running = 0;
		let peak = 0;
		const gate = deferred();
		const runs = Array.from({length: DEFAULT_MAX_CONCURRENT + 3}, () => mediaServerQueue.run(async () => {
			running++;
			peak = Math.max(peak, running);
			await gate.promise;
			running--;
		}));

		await flush();
		expect(peak).toBe(DEFAULT_MAX_CONCURRENT);

		gate.resolve();
		await Promise.all(runs);
		expect(mediaServerQueue.inFlight()).toBe(0);
	});
});
