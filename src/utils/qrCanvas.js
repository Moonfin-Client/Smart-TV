import qrcode from 'qrcode-generator';

// A TV has no browser worth sending anyone to, so links render as a QR code
// for the viewer's phone.

const TARGET_SIZE = 360;
const QUIET_MODULES = 4;

export const drawQrCode = (canvas, url) => {
	if (!canvas || !url) return;
	try {
		const qr = qrcode(0, 'M');
		qr.addData(url);
		qr.make();
		const count = qr.getModuleCount();
		const scale = Math.max(2, Math.floor(TARGET_SIZE / (count + QUIET_MODULES * 2)));
		const size = scale * (count + QUIET_MODULES * 2);
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext('2d');
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, size, size);
		context.fillStyle = '#000000';
		for (let row = 0; row < count; row++) {
			for (let col = 0; col < count; col++) {
				if (qr.isDark(row, col)) {
					context.fillRect((col + QUIET_MODULES) * scale, (row + QUIET_MODULES) * scale, scale, scale);
				}
			}
		}
	} catch (e) {
		void e;
	}
};
