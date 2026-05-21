const loadImage = (src) =>
	new Promise((resolve, reject) => {
		const img = document.createElement('img');
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});

export const analyzeLogoBrightness = async (logoUrl) => {
	if (!logoUrl) return false;
	try {
		const img = await loadImage(logoUrl);
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return false;
		canvas.width = img.width;
		canvas.height = img.height;
		ctx.drawImage(img, 0, 0);
		const {data} = ctx.getImageData(0, 0, canvas.width, canvas.height);

		let blackPixelCount = 0;
		let transparentPixelCount = 0;
		const totalPixels = data.length / 4;

		for (let i = 0; i < data.length; i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			const a = data[i + 3];
			if (a === 0) {
				transparentPixelCount++;
				continue;
			}
			if (r === 0 && g === 0 && b === 0) {
				blackPixelCount++;
			}
		}
		const visiblePixels = totalPixels - transparentPixelCount;
		if (visiblePixels === 0) return false;
		return blackPixelCount / visiblePixels > 0.85;
	} catch (err) {
		console.error('[logoUtils] analyzeLogoBrightness failed', err);
		return false;
	}
};
