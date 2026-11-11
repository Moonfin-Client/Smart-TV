// The subtitle fonts on offer. The family name is what the setting syncs, so it has to stay as it
// is. None ship with the app. A face is fetched from Google Fonts the first time a subtitle needs
// it and the browser's cache keeps it from then on. The oldest engines have no FontFace, so a face
// joins the page as an @font-face rule in a stylesheet of its own.
const GSTATIC = 'https://fonts.gstatic.com/s';

export const SUBTITLE_FONTS = [
	{family: 'Arimo', regular: `${GSTATIC}/arimo/v36/P5sfzZCDf9_T_3cV7NCUECyoxNk37cxsBw.ttf`, bold: `${GSTATIC}/arimo/v36/P5sfzZCDf9_T_3cV7NCUECyoxNk3CstsBw.ttf`},
	{family: 'Atkinson Hyperlegible', regular: `${GSTATIC}/atkinsonhyperlegible/v12/9Bt23C1KxNDXMspQ1lPyU89-1h6ONRlW45GE5Q.ttf`, bold: `${GSTATIC}/atkinsonhyperlegible/v12/9Bt73C1KxNDXMspQ1lPyU89-1h6ONRlW45G8WbcNcw.ttf`},
	{family: 'Fira Sans', regular: `${GSTATIC}/firasans/v18/va9E4kDNxMZdWfMOD5VfkA.ttf`, bold: `${GSTATIC}/firasans/v18/va9B4kDNxMZdWfMOD5VnLK3uQQ.ttf`},
	{family: 'Inter', regular: `${GSTATIC}/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf`, bold: `${GSTATIC}/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf`},
	{family: 'Lato', regular: `${GSTATIC}/lato/v25/S6uyw4BMUTPHvxk.ttf`, bold: `${GSTATIC}/lato/v25/S6u9w4BMUTPHh6UVew8.ttf`},
	{family: 'Noto Sans', regular: `${GSTATIC}/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf`, bold: `${GSTATIC}/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAaBN9d.ttf`},
	{family: 'Open Sans', regular: `${GSTATIC}/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0C4n.ttf`, bold: `${GSTATIC}/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsg-1y4n.ttf`},
	{family: 'Roboto', regular: `${GSTATIC}/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf`, bold: `${GSTATIC}/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWuYjammT.ttf`},
	{family: 'Source Sans 3', regular: `${GSTATIC}/sourcesans3/v20/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Ky461EN.ttf`, bold: `${GSTATIC}/sourcesans3/v20/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Kxf7FEN.ttf`},
	{family: 'Ubuntu', regular: `${GSTATIC}/ubuntu/v21/4iCs6KVjbNBYlgo6eA.ttf`, bold: `${GSTATIC}/ubuntu/v21/4iCv6KVjbNBYlgoCxCvTtw.ttf`}
];

const APP_FONT = "'Roboto', 'Sandstone', sans-serif";
const STYLE_ELEMENT_ID = 'moonfin-subtitle-fonts';

// TrueType 1.0, 'true' and 'OTTO', the tags a TTF or OTF file opens with.
const FONT_TAGS = [0x00010000, 0x74727565, 0x4f54544f];
export const isFontData = (bytes) => !!bytes && bytes.byteLength >= 4 && FONT_TAGS.indexOf(new DataView(bytes).getUint32(0)) >= 0;

const faces = {};
const rules = [];
const faceKey = (family, bold) => `${family} ${bold ? 700 : 400}`;

const addRule = (rule) => {
	rules.push(rule);
	let element = document.getElementById(STYLE_ELEMENT_ID);
	if (!element) {
		element = document.createElement('style');
		element.id = STYLE_ELEMENT_ID;
		document.head.appendChild(element);
	}
	element.textContent = rules.join('\n');
};

// A face only joins the page once its bytes are here and really are a font, so until then, and
// for good if it can't be had, the family names nothing and the text keeps the app's font. The
// bytes go in as a blob so the swap needs no second trip to the network.
const loadFace = (font, bold) => {
	const key = faceKey(font.family, bold);
	if (faces[key]) return;
	faces[key] = 'loading';
	Promise.resolve()
		.then(() => window.fetch(bold ? font.bold : font.regular))
		.then((response) => (response.ok ? response.arrayBuffer() : null))
		.then((bytes) => {
			// A captive portal answers with a page of its own, which must never stand in for the font.
			if (!isFontData(bytes)) throw new Error('not a font');
			const url = window.URL.createObjectURL(new window.Blob([bytes], {type: 'font/ttf'}));
			addRule(`@font-face { font-family: 'Moonfin Subtitles ${font.family}'; font-weight: ${bold ? 700 : 400}; src: url('${url}') format('truetype'); }`);
			faces[key] = 'loaded';
		})
		.catch((err) => {
			faces[key] = 'failed';
			console.warn('[SubtitleFonts] Could not load', key, err);
		});
};

// The font-family a subtitle in [family] is drawn with, or undefined for the app's own font. It
// starts the download, and the bold face only while bold text needs it.
export const subtitleFontFamily = (family, bold) => {
	const font = SUBTITLE_FONTS.find((entry) => entry.family === family);
	if (!font) return undefined;
	loadFace(font, false);
	if (bold) loadFace(font, true);
	return `'Moonfin Subtitles ${family}', ${APP_FONT}`;
};

export const subtitleFontFailed = (family) => faces[faceKey(family, false)] === 'failed';

// Picking a font again in the settings tries it again, since the network may be back.
export const retrySubtitleFont = (family) => {
	[false, true].forEach((bold) => {
		if (faces[faceKey(family, bold)] === 'failed') delete faces[faceKey(family, bold)];
	});
};
