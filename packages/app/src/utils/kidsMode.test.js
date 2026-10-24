import {
	isKidsMode, kidsModeRows, kidsModeButtons, blockedPanels, allowedPanel,
	KIDS_MODE_BUTTONS, kidsModeNeedsPin, kidsModeSettings, mergesContinueWatchingNextUp
} from './kidsMode';

const row = (id, enabled = true, order = 0) => ({id, name: id, enabled, order});

describe('the flag', () => {
	test('is off unless it is turned on', () => {
		expect(isKidsMode({})).toBe(false);
		expect(isKidsMode(undefined)).toBe(false);
		expect(isKidsMode({kidsModeEnabled: false})).toBe(false);
		expect(isKidsMode({kidsModeEnabled: true})).toBe(true);
	});

	// Settings load asynchronously, so this is read before the blob exists. Anything other than a
	// definite yes has to read as off rather than as truthy.
	test('is off while the settings are still loading', () => {
		expect(isKidsMode({kidsModeEnabled: undefined})).toBe(false);
		expect(isKidsMode({kidsModeEnabled: 'true'})).toBe(false);
	});
});

describe('home rows', () => {
	const saved = [
		row('library-tiles', true, 1),
		row('latest-media', true, 2),
		row('resume', true, 3),
		row('livetv', true, 4),
		row('seerr_trending', true, 5),
		row('favorites-movies', true, 6)
	];

	test('keeps every row when the mode is off', () => {
		expect(kidsModeRows(saved, false)).toBe(saved);
	});

	test('keeps the libraries, what arrived lately, and what is part way through', () => {
		expect(kidsModeRows(saved, true).map((r) => r.id)).toEqual(['library-tiles', 'latest-media', 'resume']);
	});

	test('keeps next up alongside continue watching', () => {
		const rows = kidsModeRows([row('resume', true, 0), row('nextup', true, 1)], true);
		expect(rows.map((r) => r.id)).toEqual(['library-tiles', 'resume', 'nextup']);
	});

	test('drops the request and live tv rows', () => {
		const ids = kidsModeRows(saved, true).map((r) => r.id);
		expect(ids).not.toContain('livetv');
		expect(ids).not.toContain('seerr_trending');
		expect(ids).not.toContain('favorites-movies');
	});

	// My Media is the artwork a child picks a library by, so the small variant goes.
	test('drops the small library row', () => {
		const rows = kidsModeRows([row('librarybuttons', true, 0), row('latest-media', true, 1)], true);
		expect(rows.map((r) => r.id)).toEqual(['library-tiles', 'latest-media']);
	});

	// An allow list, so anything added later stays out until someone decides otherwise.
	test('hides a row type nobody thought about', () => {
		expect(kidsModeRows([row('something-new')], true).map((r) => r.id)).toEqual(['library-tiles']);
	});

	// Rows are drawn in order, not in list position, so switching it on is not enough on its own.
	test('switches My Media on and puts it ahead of the rest', () => {
		const rows = kidsModeRows([row('library-tiles', false, 4), row('latest-media', true, 2)], true);
		const myMedia = rows.find((r) => r.id === 'library-tiles');

		expect(rows.map((r) => r.id)).toEqual(['library-tiles', 'latest-media']);
		expect(myMedia.enabled).toBe(true);
		expect(myMedia.order).toBeLessThan(rows.find((r) => r.id === 'latest-media').order);
	});

	// It is the only way into a library once the navbar entry is gone, so it leads either way.
	test('brings a library row the user had already enabled to the front too', () => {
		const rows = kidsModeRows([row('resume', true, 0), row('library-tiles', true, 4)], true);
		const myMedia = rows.find((r) => r.id === 'library-tiles');

		expect(myMedia.order).toBe(-1);
		expect(myMedia.order).toBeLessThan(rows.find((r) => r.id === 'resume').order);
	});

	test('adds My Media when the saved rows have no library row at all', () => {
		const rows = kidsModeRows([row('latest-media', true)], true);
		expect(rows[0]).toEqual({id: 'library-tiles', name: 'My Media', enabled: true, order: -1});
		expect(rows.map((r) => r.id)).toEqual(['library-tiles', 'latest-media']);
	});

	test('never carries the same row twice', () => {
		const rows = kidsModeRows([row('resume', true, 0), row('library-tiles', false, 4)], true);
		expect(rows.filter((r) => r.id === 'library-tiles')).toHaveLength(1);
		expect(rows.find((r) => r.id === 'library-tiles').order).toBe(-1);
	});

	test('does not rewrite the saved rows', () => {
		const before = saved.map((r) => r.id);
		kidsModeRows(saved, true);
		expect(saved.map((r) => r.id)).toEqual(before);
	});
});

// Apart they read as two places to carry on from, which means nothing to a child.
describe('continue watching and next up', () => {
	test('merge in the mode whatever the account chose', () => {
		expect(mergesContinueWatchingNextUp({kidsModeEnabled: true, mergeContinueWatchingNextUp: false})).toBe(true);
	});

	test('follow the account outside the mode', () => {
		expect(mergesContinueWatchingNextUp({mergeContinueWatchingNextUp: false})).toBe(false);
		expect(mergesContinueWatchingNextUp({mergeContinueWatchingNextUp: true})).toBe(true);
	});
});

describe('details buttons', () => {
	const buttons = [
		{id: 'watched'}, {id: 'favorite'}, {id: 'shuffle'}, {id: 'trailer'}, {id: 'playlist'},
		{id: 'collection'}, {id: 'goToSeries'}, {id: 'subtitles'}, {id: 'audio'}, {id: 'version'},
		{id: 'admin'}, {id: 'artwork'}, {id: 'deleteFiles'}, {id: 'watchWithGroup'},
		{id: 'seerrRequest'}, {id: 'seerrWatchlist'}, {id: 'seerrManage'}
	];

	// An allow list, so it is not only the risky ones that go.
	test('offers only the few a child needs', () => {
		expect(kidsModeButtons(buttons, true).map((b) => b.id)).toEqual(KIDS_MODE_BUTTONS);
	});

	test('a button nobody thought about stays out', () => {
		expect(kidsModeButtons([...buttons, {id: 'somethingNew'}], true).map((b) => b.id))
			.toEqual(KIDS_MODE_BUTTONS);
	});

	// The allow list's own order wins, whatever order the row happened to offer them in.
	test('the row reads in the order the mode sets', () => {
		const backwards = [{id: 'favorite'}, {id: 'shuffle'}];
		expect(kidsModeButtons(backwards, true).map((b) => b.id)).toEqual(['shuffle', 'favorite']);
	});

	test('one the row never offered is simply absent', () => {
		expect(kidsModeButtons([{id: 'favorite'}], true).map((b) => b.id)).toEqual(['favorite']);
	});

	test('the mode being on is what takes them away', () => {
		expect(kidsModeButtons(buttons, false)).toBe(buttons);
	});
});

describe('the panel guard', () => {
	const PANELS = {
		BROWSE: 1, LIBRARY: 3, SEARCH: 4, SETTINGS: 5, PLAYER: 6, FAVORITES: 7,
		LIVETV: 10, SEERR_DISCOVER: 11, SEERR_REQUESTS: 12, RECORDINGS: 14,
		SEERR_BROWSE: 15, SEERR_PERSON: 16, GAMES: 19
	};
	const blocked = blockedPanels(PANELS);

	test('sends the live tv and request panels back home', () => {
		[PANELS.LIVETV, PANELS.RECORDINGS, PANELS.SEERR_DISCOVER, PANELS.SEERR_REQUESTS,
			PANELS.SEERR_BROWSE, PANELS.SEERR_PERSON].forEach((panel) => {
			expect(allowedPanel(panel, blocked, PANELS.BROWSE)).toBe(PANELS.BROWSE);
		});
	});

	test('leaves the panels a child still uses alone', () => {
		[PANELS.BROWSE, PANELS.LIBRARY, PANELS.SEARCH, PANELS.SETTINGS, PANELS.PLAYER,
			PANELS.FAVORITES, PANELS.GAMES].forEach((panel) => {
			expect(allowedPanel(panel, blocked, PANELS.BROWSE)).toBe(panel);
		});
	});

	test('skips a panel this client does not have', () => {
		expect(blockedPanels({LIVETV: 10})).toEqual([10]);
	});
});

describe('the way out', () => {
	test('asks for the PIN that was set', () => {
		expect(kidsModeNeedsPin({kidsModeEnabled: true, kidsPinHash: 'abc'})).toBe(true);
	});

	// Turning the mode on stores a PIN and turning it off clears both, so this should be
	// unreachable. If it ever happens there is no code to check and no way to recover on a
	// television, so the door has to open rather than lock for good.
	test('opens without one when the mode is on but no PIN was kept', () => {
		expect(kidsModeNeedsPin({kidsModeEnabled: true, kidsPinHash: ''})).toBe(false);
		expect(kidsModeNeedsPin({kidsModeEnabled: true})).toBe(false);
		expect(kidsModeNeedsPin(undefined)).toBe(false);
	});
});

describe('the details screen', () => {
	const stored = {
		detailScreenStyle: 'v4',
		detailExpandedTabs: true,
		detailShowTechnicalDetails: true,
		hideDetailsMediaDescription: false,
		detailUseSeriesThumbnails: true,
		recommendationSystemSource: 'online'
	};

	test('is the minimalist one whatever style the user stored', () => {
		expect(kidsModeSettings({...stored, kidsModeEnabled: true}).detailScreenStyle).toBe('v5');
	});

	test('the toggles go to their minimal state', () => {
		const effective = kidsModeSettings({...stored, kidsModeEnabled: true});
		expect(effective.detailExpandedTabs).toBe(false);
		expect(effective.detailShowTechnicalDetails).toBe(false);
		expect(effective.detailUseSeriesThumbnails).toBe(false);
		expect(effective.recommendationSystemSource).toBe('local');
	});

	// The preference is named for hiding, so leaving the description out means forcing it on.
	test('hiding the description means forcing its flag on, not off', () => {
		const effective = kidsModeSettings({...stored, kidsModeEnabled: true});
		expect(effective.hideDetailsMediaDescription).toBe(true);
		expect(effective.hideDetailsMediaDescriptionMovie).toBe(true);
		expect(effective.hideDetailsMediaDescriptionShow).toBe(true);
		expect(effective.hideDetailsMediaDescriptionSeason).toBe(true);
		expect(effective.hideDetailsMediaDescriptionEpisode).toBe(true);
		expect(effective.hideDetailsMediaDescriptionBoxSet).toBe(true);
		expect(effective.hideDetailsMediaDescriptionBook).toBe(true);
		expect(effective.hideDetailsMediaDescriptionPerson).toBe(true);
		expect(effective.hideDetailsMediaDescriptionMusic).toBe(true);
		expect(effective.hideDetailsMediaDescriptionSeerrMovie).toBe(true);
		expect(effective.hideDetailsMediaDescriptionSeerrShow).toBe(true);
		expect(effective.hideDetailsMediaDescriptionSeerrCollection).toBe(true);
	});

	// Read never written, so the stored style still syncs as the user picked it.
	test('leaves the stored settings alone', () => {
		const settings = {...stored, kidsModeEnabled: true};
		kidsModeSettings(settings);
		expect(settings.detailScreenStyle).toBe('v4');
		expect(settings.detailExpandedTabs).toBe(true);
	});

	test('leaves the settings as they are with the mode off', () => {
		expect(kidsModeSettings(stored)).toBe(stored);
		expect(kidsModeSettings({...stored, kidsModeEnabled: false}).detailScreenStyle).toBe('v4');
	});
});
