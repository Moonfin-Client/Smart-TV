import JSZip from 'jszip';
import {loadScript} from './books';
import {assetUrl} from './assetUrl.js';

// jellyfin-web 12 builds its location index with generate(1024), and using the
// same size is what makes a saved percentage point at the same place in both.
const CHARS_PER_LOCATION = 1024;

// epub.js 0.3.93 leaves two listeners on the page when a book closes: each chapter's Contents puts a
// visibilitychange on the document, and the view manager an unload on the window. They keep the
// whole book file and every chapter's frame alive after the reader closes, so both are removed when
// their owner is destroyed.
const releaseOnDestroy = (ePub) => {
	const Contents = ePub.Contents;
	const Manager = ePub.Rendition && ePub.Rendition.prototype.requireManager('default');
	if (!Contents || !Manager || Contents.prototype.releasesOnDestroy) return;
	Contents.prototype.releasesOnDestroy = true;
	Contents.prototype.visibilityListeners = function () {
		this._onVisibility = () => {
			if (document.visibilityState === 'visible' && this.active === false) {
				this.active = true;
				this.resizeListeners();
			} else {
				this.active = false;
				clearTimeout(this.expanding);
			}
		};
		document.addEventListener('visibilitychange', this._onVisibility);
	};
	const destroyContents = Contents.prototype.destroy;
	Contents.prototype.destroy = function () {
		document.removeEventListener('visibilitychange', this._onVisibility);
		return destroyContents.apply(this, arguments);
	};
	Manager.prototype.addEventListeners = function () {
		this._onUnload = () => this.destroy();
		window.addEventListener('unload', this._onUnload);
		this._onScroll = this.onScroll.bind(this);
		(this.settings.fullsize ? window : this.container).addEventListener('scroll', this._onScroll);
	};
	const removeManagerListeners = Manager.prototype.removeEventListeners;
	Manager.prototype.removeEventListeners = function () {
		window.removeEventListener('unload', this._onUnload);
		return removeManagerListeners.apply(this, arguments);
	};
};

export const loadEpubJs = () => {
	// The legacy epub.js build finds JSZip on the window.
	window.JSZip = JSZip;
	return loadScript(assetUrl('reader/epub.legacy.min.js')).then(() => {
		releaseOnDestroy(window.ePub);
		return window.ePub;
	});
};

const themeRules = (s) => {
	const imp = ' !important';
	return {
		'html, body': {background: 'transparent' + imp},
		body: {
			'font-family': s.font + imp,
			'font-size': s.size + 'px' + imp,
			'line-height': s.lineHeight + imp,
			'font-weight': s.bold ? '600' : 'normal',
			'text-align': s.justify ? 'justify' : 'initial'
		},
		'body, body *:not(a)': {
			color: s.fg + imp,
			'-webkit-text-fill-color': s.fg + imp,
			'background-color': 'transparent' + imp,
			'border-color': s.fg + imp
		},
		'a, a *': {
			color: s.link + imp,
			'-webkit-text-fill-color': s.link + imp
		}
	};
};

// Some TV engines measure a right to left chapter as wide as its frame, so
// epub.js keeps widening the frame and never reaches the last page. The laid out
// boxes give the real width on every engine.
function boxWidth () {
	const range = this.document.createRange();
	range.selectNodeContents(this.content || this.document.body);
	const rects = range.getClientRects();
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < rects.length; i++) {
		if (rects[i].width < 1 || rects[i].height < 1) continue;
		min = Math.min(min, rects[i].left);
		max = Math.max(max, rects[i].right);
	}
	return max > min ? Math.round(max - min) : 0;
}

// epub.js finds a right to left page's scroll position only the way newer engines count it,
// down from zero. Older ones like webOS 3 count up from the left edge, so every saved place
// would land on the chapter's last page there. The engine's way is only known once it has laid out.
const countFromLeft = (manager) => {
	const moveTo = manager.moveTo;
	manager.moveTo = (offset, width) => {
		if (manager.settings.direction !== 'rtl' || manager.settings.rtlScrollType !== 'default') {
			moveTo.call(manager, offset, width);
			return;
		}
		const page = manager.layout.delta;
		manager.scrollTo(Math.min(Math.floor(offset.left / page) * page, manager.container.scrollWidth - page), 0, true);
	};
};

const quiet = (promise) => {
	if (promise && promise.catch) promise.catch(() => {});
};

// The table of contents flattened in reading order, each entry with the spine section it opens.
const flattenToc = (book, entries, depth = 0, out = []) => {
	(entries || []).forEach((entry) => {
		const section = entry.href ? book.spine.get(entry.href) : null;
		out.push({label: String(entry.label || '').trim(), href: entry.href, depth, index: section ? section.index : -1});
		flattenToc(book, entry.subitems, depth + 1, out);
	});
	return out;
};

// Opens the book in element and resolves once the first page shows. onRelocated
// gets {cfi, index, percentage, atEnd, minutesLeft}, with percentage and minutes
// null until the location index is built.
export const openEpub = ({ePub, element, buffer, cfi, fraction, style: initialStyle, onRelocated, onKey}) => {
	const book = ePub(buffer);
	let style = initialStyle;
	let rendition = null;
	let sectionEnds = null;
	let locationsReady = null;
	let destroyed = false;
	let lastWheel = 0;
	let lastCfi = null;
	// Where a restyle reopens the book. Kept across restyles in a row so they don't drift.
	let anchorCfi = null;
	let restyleTimer = null;

	const rtl = () => book.package.metadata.direction === 'rtl';

	// epub.js rests 100 ms after each chapter so an index built behind the open book leaves room for
	// page turns. When the first page waits on the index those rests are dead time.
	const generateLocations = (blocking) => {
		if (!locationsReady) {
			if (blocking) book.locations.pause = 0;
			locationsReady = book.locations.generate(CHARS_PER_LOCATION).then(() => {
				sectionEnds = {};
				const all = JSON.parse(book.locations.save());
				all.forEach((location, i) => {
					sectionEnds[new ePub.CFI(location).spinePos] = i;
				});
			});
		}
		return locationsReady;
	};

	const minutesLeft = (at, index) => {
		const end = sectionEnds && sectionEnds[index];
		const here = book.locations.locationFromCfi(at);
		if (end == null || here == null || here < 0) return null;
		// A 1024 character location is about 170 words, read at 200 a minute.
		return Math.max(1, Math.ceil((end - here + 1) * 170 / 200));
	};

	const relocated = (loc) => {
		if (destroyed || !loc || !loc.start || !loc.start.cfi) return;
		const indexed = book.locations.length() > 0;
		lastCfi = loc.start.cfi;
		onRelocated({
			cfi: loc.start.cfi,
			index: loc.start.index,
			atEnd: !!loc.atEnd,
			percentage: indexed ? book.locations.percentageFromCfi(loc.start.cfi) : null,
			minutesLeft: indexed ? minutesLeft(loc.start.cfi, loc.start.index) : null
		});
	};

	const turn = (forward) => {
		if (!rendition) return;
		anchorCfi = null;
		if (forward) {
			quiet(rendition.next());
			return;
		}
		const from = rendition.currentLocation();
		const back = rendition.prev();
		if (!back || !back.then) return;
		quiet(back.then(() => {
			const now = rendition.currentLocation();
			if (!from || !now || from.start.index === now.start.index) return;
			// Going back into the previous chapter should land on its end, but epub.js
			// jumps there before a right to left chapter has laid out its last page.
			const box = rendition.manager.container;
			window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
				const end = box.scrollWidth - box.offsetWidth;
				if (!rtl()) box.scrollLeft = end;
				else box.scrollLeft = rendition.manager.settings.rtlScrollType === 'default' ? 0 : -end;
			}));
		}));
	};

	// dir is on screen, -1 for left and 1 for right. A right to left book's next
	// page is on the left.
	const turnToward = (dir) => turn(rtl() ? dir < 0 : dir > 0);

	const onWheel = (e) => {
		const now = Date.now();
		const burstStart = now - lastWheel > 250;
		lastWheel = now;
		// A wheel flick sends a burst of events, so it turns one page per burst.
		if (!burstStart) return;
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) turnToward(e.deltaX > 0 ? 1 : -1);
		else if (e.deltaY) turn(e.deltaY > 0);
	};

	const hookContent = (contents) => {
		if (rtl()) contents.textWidth = boxWidth;
		// Keys typed while a pointer left focus in the chapter go to its frame.
		contents.document.addEventListener('keydown', onKey);
		contents.document.addEventListener('wheel', onWheel);
	};

	const settled = () => {
		const waits = [];
		rendition.getContents().forEach((contents) => {
			const doc = contents.document;
			if (doc.fonts && doc.fonts.ready) waits.push(doc.fonts.ready);
			Array.prototype.forEach.call(doc.images, (img) => {
				if (img.complete) return;
				waits.push(new Promise((done) => {
					img.addEventListener('load', done);
					img.addEventListener('error', done);
				}));
			});
		});
		return Promise.race([Promise.all(waits), new Promise((done) => setTimeout(done, 3000))]);
	};

	const render = (target) => {
		if (rendition) rendition.destroy();
		// Books can't run scripts, which also keeps them away from the session.
		rendition = book.renderTo(element, {width: '100%', height: '100%', flow: 'paginated'});
		rendition.on('started', () => countFromLeft(rendition.manager));
		rendition.themes.default(themeRules(style));
		rendition.hooks.content.register(hookContent);
		rendition.on('relocated', relocated);
		return rendition.display(target).then(() => {
			// The first display measures the chapter before the theme, its fonts and
			// its images have reflowed it, which lands pages early.
			if (typeof target !== 'string') return;
			return settled().then(() => rendition.display(target)).then(() => {
				// A saved page starts a line, and the start of a line can measure as
				// the end of the line before it, a page back.
				const shown = rendition.currentLocation();
				if (shown && shown.end && shown.end.cfi && new ePub.CFI().compare(target, shown.end.cfi) > 0) {
					return rendition.next();
				}
			});
		});
	};

	const display = (target) => {
		if (!rendition) return;
		anchorCfi = null;
		quiet(rendition.display(target));
	};

	const restyle = (next) => {
		style = next;
		anchorCfi = anchorCfi || lastCfi;
		clearTimeout(restyleTimer);
		restyleTimer = setTimeout(() => {
			if (!destroyed) quiet(render(anchorCfi || undefined));
		}, 250);
	};

	element.addEventListener('wheel', onWheel);

	return book.ready.then(() => {
		// A server place is a percentage, which needs the location index first.
		if (fraction > 0) {
			return generateLocations(true).then(() => {
				// Locations are ranges, and Chromium places a right to left range by its
				// far end, a page late, so start from its first character.
				const at = new ePub.CFI(book.locations.cfiFromPercentage(fraction));
				at.collapse(true);
				return at.toString();
			});
		}
		return cfi || undefined;
	}).then((target) => render(target).catch(() => render(undefined))).then(() => {
		generateLocations().then(() => {
			if (rendition) relocated(rendition.location);
		}, () => {});
		return {
			next: () => turn(true),
			prev: () => turn(false),
			turnToward,
			display,
			restyle,
			toc: () => flattenToc(book, book.navigation && book.navigation.toc),
			// Needs the location index, so it does nothing until percentages show.
			displayFraction: (value) => {
				if (book.locations.length() === 0) return;
				const at = new ePub.CFI(book.locations.cfiFromPercentage(value));
				at.collapse(true);
				display(at.toString());
			},
			destroy: () => {
				destroyed = true;
				clearTimeout(restyleTimer);
				element.removeEventListener('wheel', onWheel);
				if (rendition) rendition.destroy();
				book.destroy();
			}
		};
	});
};
