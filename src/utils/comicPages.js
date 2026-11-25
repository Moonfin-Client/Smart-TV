import JSZip from 'jszip';
import {readTarEntries, sortPages} from './books';

// Each source lists the pages up front and reads one only when it's asked for,
// so a long comic never sits in memory decoded all at once.

const zipPages = async (buffer) => {
	const zip = await JSZip.loadAsync(buffer);
	const names = sortPages(Object.keys(zip.files).filter((name) => !zip.files[name].dir));
	return {names, load: (index) => zip.file(names[index]).async('blob'), close: () => {}};
};

const tarPages = (buffer) => {
	const entries = {};
	readTarEntries(buffer).forEach((entry) => {
		entries[entry.name] = entry;
	});
	const names = sortPages(Object.keys(entries));
	const load = (index) => {
		const entry = entries[names[index]];
		return Promise.resolve(new Blob([buffer.slice(entry.offset, entry.offset + entry.size)]));
	};
	return {names, load, close: () => {}};
};

const deferred = () => {
	const slot = {};
	slot.promise = new Promise((resolve, reject) => {
		slot.resolve = resolve;
		slot.reject = reject;
	});
	return slot;
};

// The decoder rescans the archive from the start for every single file, which
// crawls on a solid RAR, so it unpacks everything in one pass and pages fill in
// as they arrive.
const workerPages = (buffer) => new Promise((resolve, reject) => {
	const worker = new window.Worker('reader/libarchive-worker.js');
	const listed = [];
	const pages = {};
	let names = null;
	let readyTimer = null;
	const page = (name) => pages[name] || (pages[name] = deferred());
	const fail = (error) => {
		clearTimeout(readyTimer);
		worker.terminate();
		if (names) Object.keys(pages).forEach((name) => pages[name].reject(error));
		else reject(error);
	};
	// An engine that can't run the decoder never answers at all.
	readyTimer = setTimeout(() => fail(new Error('The archive reader didn\'t start')), 20000);
	worker.onerror = (e) => fail(new Error(e.message || 'The archive reader failed'));
	worker.onmessage = ({data}) => {
		if (data.type === 'READY') {
			clearTimeout(readyTimer);
			worker.postMessage({type: 'OPEN', file: new Blob([buffer])});
		} else if (data.type === 'OPENED') {
			worker.postMessage({type: 'LIST_FILES'});
		} else if (data.type === 'ENTRY') {
			if (!names) listed.push(data.entry.path);
			else if (data.entry.fileData) page(data.entry.path).resolve(new Blob([data.entry.fileData]));
		} else if (data.type === 'END') {
			if (names) {
				worker.terminate();
				return;
			}
			names = sortPages(listed);
			resolve({names, load: (index) => page(names[index]).promise, close: () => worker.terminate()});
			worker.postMessage({type: 'EXTRACT_FILES'});
		} else if (data.type === 'ERROR') {
			fail(new Error((data.error && data.error.message) || 'The archive reader failed'));
		}
	};
	worker.postMessage({type: 'HELLO'});
});

export const openComicPages = (buffer, archive) => {
	if (archive === 'zip') return zipPages(buffer);
	if (archive === 'tar') return Promise.resolve(tarPages(buffer));
	return workerPages(buffer);
};
