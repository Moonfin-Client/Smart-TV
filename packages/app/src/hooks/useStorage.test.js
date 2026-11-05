import {act, renderHook, waitFor} from '@testing-library/react';

import {getFromStorage, saveToStorage} from '../services/storage';
import {useStorage} from './useStorage';

jest.mock('../services/storage', () => ({getFromStorage: jest.fn(), saveToStorage: jest.fn()}));

const stored = {};

beforeEach(() => {
	jest.clearAllMocks();
	Object.keys(stored).forEach((key) => delete stored[key]);
	getFromStorage.mockImplementation((key) => Promise.resolve(key in stored ? stored[key] : null));
});

describe('useStorage', () => {
	test('holds the default until the stored value is read', async () => {
		stored.size = 'large';
		const {result} = renderHook(() => useStorage('size', 'medium'));

		expect(result.current[0]).toBe('medium');
		expect(result.current[2]).toBe(false);
		await waitFor(() => expect(result.current[2]).toBe(true));
		expect(result.current[0]).toBe('large');
	});

	test('reads as not loaded again while a new key is read', async () => {
		stored.a = 'one';
		const {result, rerender} = renderHook(({key}) => useStorage(key, 'none'), {initialProps: {key: 'a'}});
		await waitFor(() => expect(result.current[2]).toBe(true));

		rerender({key: 'b'});

		expect(result.current[2]).toBe(false);
		await waitFor(() => expect(result.current[2]).toBe(true));
		expect(result.current[0]).toBe('none');
	});

	test('a save before the read lands wins over what was stored', async () => {
		stored.size = 'large';
		const {result} = renderHook(() => useStorage('size', 'medium'));

		act(() => result.current[1]('small'));
		await act(() => Promise.resolve());

		expect(result.current[0]).toBe('small');
		expect(result.current[2]).toBe(true);
		expect(saveToStorage).toHaveBeenCalledWith('size', 'small');
	});
});
