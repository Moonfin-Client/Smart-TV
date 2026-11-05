import {act, fireEvent, render, screen} from '@testing-library/react';

import {handleSectionKey, hasNeighbor, playSongFromAlbum, quickItems, songSubtitle} from './musicLibrary';
import MusicTabs from './MusicTabs';
import MusicTrackList from './MusicTrackList';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true), getPointerMode: () => false}));
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => {
	const React = require('react');
	return React.forwardRef(({spotlightId, ...props}, ref) => React.createElement(type, {...props, ref, 'data-spotlight-id': spotlightId}));
});
jest.mock('../../platform', () => ({getPlatform: () => 'webos'}));

const song = (id, albumId, extra) => ({Id: id, Type: 'Audio', Name: `Song ${id}`, AlbumId: albumId, Album: albumId && `Album ${albumId}`, ...extra});

describe('quickItems', () => {
	test('turns the songs played last into their albums, each once, then adds the playlists', () => {
		const items = quickItems(
			[song('s1', 'a1', {AlbumPrimaryImageTag: 'tag1'}), song('s2', 'a1'), song('s3', 'a2')],
			[{Id: 'p1', Type: 'Playlist', Name: 'Road Trip'}]
		);
		expect(items.map((item) => [item.Type, item.Id, item.Name])).toEqual([
			['MusicAlbum', 'a1', 'Album a1'],
			['MusicAlbum', 'a2', 'Album a2'],
			['Playlist', 'p1', 'Road Trip']
		]);
		expect(items[0].ImageTags).toEqual({Primary: 'tag1'});
	});

	test('keeps a song with no album as itself, once', () => {
		const loose = song('s9');
		expect(quickItems([loose, loose])).toEqual([loose]);
	});

	test('stops at eight', () => {
		const tracks = Array.from({length: 6}, (_, i) => song(`s${i}`, `a${i}`));
		const playlists = Array.from({length: 6}, (_, i) => ({Id: `p${i}`, Type: 'Playlist'}));
		const items = quickItems(tracks, playlists);
		expect(items).toHaveLength(8);
		expect(items.slice(6).map((item) => item.Id)).toEqual(['p0', 'p1']);
	});
});

// A box at a column and row of a grid of 100 by 100 cells.
const cell = (column, row) => ({left: column * 100, right: column * 100 + 90, top: row * 100, bottom: row * 100 + 90});

describe('hasNeighbor', () => {
	const grid = [cell(0, 0), cell(1, 0), cell(2, 0), cell(0, 1)];

	test('sees the row under the top row and nothing over it', () => {
		expect(hasNeighbor(cell(2, 0), grid, 'down')).toBe(true);
		expect(hasNeighbor(cell(2, 0), grid, 'up')).toBe(false);
		expect(hasNeighbor(cell(0, 1), grid, 'down')).toBe(false);
	});

	test('sees the first column as the left edge', () => {
		expect(hasNeighbor(cell(0, 0), grid, 'left')).toBe(false);
		expect(hasNeighbor(cell(1, 0), grid, 'left')).toBe(true);
	});

	test('doesn\'t read a zoomed card in the same row as one above it', () => {
		const zoomed = {left: 95, right: 195, top: -5, bottom: 95};
		expect(hasNeighbor(zoomed, [cell(0, 0), cell(2, 0)], 'up')).toBe(false);
	});
});

describe('handleSectionKey', () => {
	const KEY = {up: 38, down: 40, left: 37, right: 39};
	const chain = ['tabs', 'play', 'latest'];

	// A section holding one row of two stops, with the event coming from `index`.
	const press = (direction, index, extra = {}) => {
		const section = document.createElement('div');
		const stops = [0, 1].map((column) => {
			const el = document.createElement('div');
			el.className = 'spottable';
			el.getBoundingClientRect = () => cell(column, 0);
			section.appendChild(el);
			return el;
		});
		const e = {keyCode: KEY[direction], target: stops[index], currentTarget: section, preventDefault: jest.fn(), stopPropagation: jest.fn()};
		const focusNode = jest.fn();
		handleSectionKey(e, {node: 'play', chain, focusNode, ...extra});
		return {e, focusNode};
	};

	test('sends up and down at the edge to the sections around it', () => {
		expect(press('up', 1).focusNode).toHaveBeenCalledWith('tabs');
		const {e, focusNode} = press('down', 0);
		expect(focusNode).toHaveBeenCalledWith('latest');
		expect(e.stopPropagation).toHaveBeenCalled();
	});

	test('leaves a move inside the section to Spotlight', () => {
		const onLeft = jest.fn();
		const {e} = press('left', 1, {onLeft});
		expect(onLeft).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	test('sends left off the first column where the screen asks', () => {
		const onLeft = jest.fn();
		press('left', 0, {onLeft});
		expect(onLeft).toHaveBeenCalled();
	});

	test('takes up and down to the section\'s own stops when it has them', () => {
		const onUp = jest.fn();
		const onDown = jest.fn();
		const up = press('up', 0, {onUp, onDown});
		expect(onUp).toHaveBeenCalled();
		expect(up.focusNode).not.toHaveBeenCalled();
		press('down', 1, {onUp, onDown});
		expect(onDown).toHaveBeenCalled();
	});

	test('holds focus at a side edge with nowhere to go', () => {
		const left = press('left', 0);
		expect(left.e.preventDefault).toHaveBeenCalled();
		expect(left.focusNode).not.toHaveBeenCalled();
		const right = press('right', 1);
		expect(right.e.preventDefault).toHaveBeenCalled();
		expect(right.focusNode).not.toHaveBeenCalled();
		expect(press('right', 0).e.preventDefault).not.toHaveBeenCalled();
	});
});

describe('playSongFromAlbum', () => {
	const tracks = [song('s1', 'a1'), song('s2', 'a1'), song('s3', 'a1')];

	test('plays the album from the song picked', async () => {
		const onPlay = jest.fn();
		const api = {getAlbumTracks: jest.fn(() => Promise.resolve({Items: tracks}))};
		await playSongFromAlbum({api, onPlay}, song('s2', 'a1'));
		expect(api.getAlbumTracks).toHaveBeenCalledWith('a1');
		expect(onPlay).toHaveBeenCalledWith(tracks[1], false, {audioPlaylist: tracks});
	});

	test('uses the tracks the screen already has', async () => {
		const onPlay = jest.fn();
		const api = {getAlbumTracks: jest.fn()};
		await playSongFromAlbum({api, onPlay}, tracks[2], tracks);
		expect(api.getAlbumTracks).not.toHaveBeenCalled();
		expect(onPlay).toHaveBeenCalledWith(tracks[2], false, {audioPlaylist: tracks});
	});

	test('plays the song alone when its album won\'t load', async () => {
		const onPlay = jest.fn();
		const onSelectItem = jest.fn();
		const api = {getAlbumTracks: jest.fn(() => Promise.reject(new Error('offline')))};
		const loose = song('s2', 'a1');
		await playSongFromAlbum({api, onPlay, onSelectItem}, loose);
		expect(onPlay).not.toHaveBeenCalled();
		expect(onSelectItem).toHaveBeenCalledWith(loose);
	});
});

describe('MusicTabs', () => {
	test('the arrows move the highlight along the tabs without opening one', () => {
		const onOpenGrid = jest.fn();
		render(<MusicTabs onOpenGrid={onOpenGrid} />);
		fireEvent.focus(screen.getByText('Albums'));
		fireEvent.focus(screen.getByText('Songs'));
		expect(onOpenGrid).not.toHaveBeenCalled();
		expect(screen.getByText('Songs').className).toContain('tabActive');
		expect(screen.getByText('Overview').className).not.toContain('tabActive');
	});

	test('the highlight goes back to Overview once focus leaves the tabs', () => {
		jest.useFakeTimers();
		render(<MusicTabs onOpenGrid={jest.fn()} />);
		const songs = screen.getByText('Songs');
		fireEvent.focus(songs);
		fireEvent.focusOut(songs);
		act(() => jest.runAllTimers());
		jest.useRealTimers();
		expect(screen.getByText('Overview').className).toContain('tabActive');
	});

	test('Select or a click opens the grid the tab names, and Overview opens nothing', () => {
		const onOpenGrid = jest.fn();
		render(<MusicTabs onOpenGrid={onOpenGrid} />);
		fireEvent.click(screen.getByText('Overview'));
		expect(onOpenGrid).not.toHaveBeenCalled();
		fireEvent.click(screen.getByText('Artists'));
		expect(onOpenGrid).toHaveBeenCalledWith('albumArtists');
		fireEvent.click(screen.getByText('Favorites'));
		expect(onOpenGrid).toHaveBeenCalledWith('favoriteItems');
	});

	test('over a category screen its own pill rests highlighted, opens nothing, and Overview opens', () => {
		jest.useFakeTimers();
		const onOpenGrid = jest.fn();
		render(<MusicTabs current="albums" onOpenGrid={onOpenGrid} activeSpotlightId="current-pill" />);
		const albums = screen.getByText('Albums');
		expect(albums.className).toContain('tabActive');
		expect(albums.dataset.spotlightId).toBe('current-pill');
		fireEvent.click(albums);
		expect(onOpenGrid).not.toHaveBeenCalled();
		const songs = screen.getByText('Songs');
		fireEvent.focus(songs);
		fireEvent.focusOut(songs);
		act(() => jest.runAllTimers());
		jest.useRealTimers();
		expect(albums.className).toContain('tabActive');
		fireEvent.click(screen.getByText('Overview'));
		expect(onOpenGrid).toHaveBeenCalledWith('overview');
	});

	test('lists the categories in order', () => {
		render(<MusicTabs onOpenGrid={jest.fn()} />);
		expect(Array.from(document.querySelectorAll('[data-id]'), (el) => el.dataset.id))
			.toEqual(['overview', 'albumArtists', 'albums', 'songs', 'playlists', 'genres', 'favoriteItems']);
	});
});

describe('the song rows', () => {
	test('a Last Played row reads artist then album, and leaves out what is missing', () => {
		expect(songSubtitle({Type: 'Audio', Artists: ['Daft Punk'], Album: 'Discovery'})).toBe('Daft Punk · Discovery');
		expect(songSubtitle({Type: 'Audio', Artists: ['Daft Punk']})).toBe('Daft Punk');
		expect(songSubtitle({Type: 'Audio', Album: 'Discovery'})).toBe('Discovery');
	});

	test('an album row is the number, the title and the length on one line, and Select plays it', () => {
		const onPlay = jest.fn();
		const tracks = [song('s1', 'a1', {IndexNumber: 4, RunTimeTicks: 2750000000, Artists: ['Daft Punk']})];
		render(<MusicTrackList tracks={tracks} numbered onPlay={onPlay} />);
		const row = document.querySelector('[data-index="0"]');
		expect(Array.from(row.children, (el) => el.textContent)).toEqual(['4', 'Song s1', '4:35']);
		fireEvent.click(row);
		expect(onPlay).toHaveBeenCalledWith(tracks[0]);
	});
});
