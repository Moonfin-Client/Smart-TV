import {findOpaqueBounds} from './logoAutocrop';

// An RGBA buffer shaped like what getImageData hands back, with only the pixels named in it
// carrying any alpha.
const bitmap = (width, height, pixels) => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (const [x, y, alpha] of pixels) {
		data[(y * width + x) * 4 + 3] = alpha;
	}
	return data;
};

describe('findOpaqueBounds', () => {
	test('finds nothing in a fully transparent image', () => {
		expect(findOpaqueBounds(bitmap(4, 4, []), 4, 4)).toBeNull();
	});

	test('boxes in a single opaque pixel', () => {
		expect(findOpaqueBounds(bitmap(4, 4, [[2, 1, 255]]), 4, 4)).toEqual({minX: 2, minY: 1, maxX: 2, maxY: 1});
	});

	test('leaves the transparent margin outside the box', () => {
		const ink = [];
		for (let y = 2; y <= 4; y++) {
			for (let x = 1; x <= 5; x++) ink.push([x, y, 255]);
		}
		expect(findOpaqueBounds(bitmap(8, 8, ink), 8, 8)).toEqual({minX: 1, minY: 2, maxX: 5, maxY: 4});
	});

	test('reaches every edge when the ink runs to the border', () => {
		const ink = [[0, 0, 255], [3, 3, 255]];
		expect(findOpaqueBounds(bitmap(4, 4, ink), 4, 4)).toEqual({minX: 0, minY: 0, maxX: 3, maxY: 3});
	});

	test('treats faint pixels at the threshold as margin', () => {
		expect(findOpaqueBounds(bitmap(4, 4, [[1, 1, 16]]), 4, 4)).toBeNull();
		expect(findOpaqueBounds(bitmap(4, 4, [[1, 1, 17]]), 4, 4)).toEqual({minX: 1, minY: 1, maxX: 1, maxY: 1});
	});
});
