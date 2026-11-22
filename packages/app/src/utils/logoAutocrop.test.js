import {findOpaqueBounds, trimmedLogo} from './logoAutocrop';

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

describe('trimmedLogo', () => {
	// Where the background puts a fraction of the image, as a fraction of the box, for a percentage position.
	const placed = (size, position, fraction) => (1 - size) * position / 100 + fraction * size;

	test('lines the ink up with the box edges, with the room above and below', () => {
		// Ink from x 24 to 119 and y 20 to 39 on a 240 by 60 scan of a 800 by 200 logo.
		const {url, aspectRatio, style} = trimmedLogo('http://server/logo.png', {minX: 24, minY: 20, maxX: 119, maxY: 39}, 240, 60, 800, 200);
		const across = 96 / 240;
		const down = (20 / 60) * 1.12;
		expect(aspectRatio).toBe(Math.round(across * 800) / Math.round(down * 200));
		expect(decodeURIComponent(url)).toContain(`width="${Math.round(across * 800)}" height="${Math.round(down * 200)}"`);
		expect(style.backgroundImage).toBe('url("http://server/logo.png")');

		const [sizeX, sizeY] = style.backgroundSize.split(' ').map((v) => 100 / parseFloat(v));
		const [posX, posY] = style.backgroundPosition.split(' ').map(parseFloat);
		expect(sizeX).toBeCloseTo(across, 5);
		expect(sizeY).toBeCloseTo(down, 5);
		// The ink's left edge lands on the box's left edge, and its top sits a pad below the box's top.
		expect(placed(1 / sizeX, posX, 24 / 240)).toBeCloseTo(0, 5);
		expect(placed(1 / sizeY, posY, 20 / 60)).toBeCloseTo(0.06 / 1.12, 5);
	});

	test("doesn't move an image whose ink fills it across", () => {
		const {style} = trimmedLogo('logo', {minX: 0, minY: 10, maxX: 239, maxY: 49}, 240, 60, 800, 200);
		expect(style.backgroundPosition.split(' ')[0]).toBe('0%');
	});
});
