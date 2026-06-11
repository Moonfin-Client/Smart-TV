import {computePerfTier} from './perfTier';

describe('computePerfTier', () => {
	test('Tizen 2.4 WebKit (no Chrome token) is low', () => {
		expect(computePerfTier('Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/2.4 TV Safari/538.1')).toBe('low');
	});

	test('webOS 3.x Chromium 38 is low', () => {
		expect(computePerfTier('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.122 Safari/537.36 LG Browser/8.00.00(LGE; 55UH8500-UA; 03.20.50)')).toBe('low');
	});

	test('Tizen 3.0 Chromium 47 is low', () => {
		expect(computePerfTier('Mozilla/5.0 (SMART-TV; LINUX; Tizen 3.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/3.0 Chrome/47.0.2526.69 TV safari/538.1')).toBe('low');
	});

	test('webOS 4.x Chromium 53 is low', () => {
		expect(computePerfTier('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager')).toBe('low');
	});

	test('Tizen 4.0 Chromium 56 is mid', () => {
		expect(computePerfTier('Mozilla/5.0 (SMART-TV; LINUX; Tizen 4.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/56.0.2924.0 TV safari/537.36')).toBe('mid');
	});

	test('webOS 5.x Chromium 68 is mid', () => {
		expect(computePerfTier('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager')).toBe('mid');
	});

	test('webOS 6.x Chromium 79 is mid', () => {
		expect(computePerfTier('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager')).toBe('mid');
	});

	test('Tizen 6.5 Chromium 85 is high', () => {
		expect(computePerfTier('Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.93 TV Safari/537.36')).toBe('high');
	});

	test('webOS 22 Chromium 87 is high', () => {
		expect(computePerfTier('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager')).toBe('high');
	});

	test('Chromium 120 is high', () => {
		expect(computePerfTier('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebAppManager')).toBe('high');
	});

	test('empty and garbage UAs are low', () => {
		expect(computePerfTier('')).toBe('low');
		expect(computePerfTier(undefined)).toBe('low');
		expect(computePerfTier('Mozilla/5.0 Chrome/NaN')).toBe('low');
	});
});
