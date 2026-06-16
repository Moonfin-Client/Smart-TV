const loadImage = (src) =>
	new Promise((resolve, reject) => {
		const img = document.createElement('img');
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});

export const analyzeLogoBrightness = async (logoUrl, sampleWidth = 64) => {
    if (!logoUrl) return false;

    try {
        const img = await loadImage(logoUrl);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        const ratio = img.height / img.width;
        const sampleHeight = Math.max(1, Math.round(sampleWidth * ratio));
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;

        ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
        const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);

        const darkThreshold = 90;
        let blackPixelCount = 0;
        let transparentPixelCount = 0;
        const totalPixels = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a < 16) {
                transparentPixelCount++;
                continue;
            }

            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (luminance <= darkThreshold) {
                blackPixelCount++;
            }
        }

        const visiblePixels = totalPixels - transparentPixelCount;
        if (visiblePixels === 0) return false;

        return blackPixelCount / visiblePixels > 0.55;
    } catch (err) {
        console.error('[imgUtils] analyzeLogoBrightness failed', err);
        return false;
    }
};
