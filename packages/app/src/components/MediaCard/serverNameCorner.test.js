import {serverNameCorner} from './serverNameCorner';

const css = {serverBadge: 'name', sourceBadge: 'source', belowServerBadge: 'below', belowSourceBadge: 'belowSource'};
const show = {Id: '1', Type: 'Series', _serverName: 'JellyFlix', UserData: {UnplayedItemCount: 3}};

describe('serverNameCorner', () => {
	it('moves the badges below a server\'s name and the poster labels below them', () => {
		const corner = serverNameCorner({css, item: show, showServerBadge: true, showIndicators: true, showUnplayedCount: true});
		expect(corner).toMatchObject({showsServerName: true, nameClass: 'name', belowNameClass: ' below', labelsTopRight: 76, movedTop: 44});
	});

	it('pushes the poster labels down by the Seerr banner, so they clear the moved badges under it', () => {
		const corner = serverNameCorner({css, item: show, showServerBadge: true, showIndicators: true, showUnplayedCount: true, bannerOffset: 20});
		expect(corner.labelsTopRight).toBe(96);
	});

	it('keeps a source\'s name small and the badges below it higher', () => {
		const calendar = {Id: 'cal-radarr-1', Type: 'Movie', _external: true, _serverName: 'Radarr', UserData: {Played: true}};
		const corner = serverNameCorner({css, item: calendar, showServerBadge: false, showIndicators: true, showUnplayedCount: false});
		expect(corner).toMatchObject({nameClass: 'name source', belowNameClass: ' below belowSource', movedTop: 34});
	});

	it('names no server for a title several servers hold, and leaves the corner as it was', () => {
		const merged = {...show, _mergedCopies: [{Id: '2', _serverId: 'b'}]};
		const corner = serverNameCorner({css, item: merged, showServerBadge: true, showIndicators: true, showUnplayedCount: true});
		expect(corner).toMatchObject({showsServerName: false, belowNameClass: '', labelsTopRight: 8, movedTop: undefined});
	});

	it('still names the server when every copy is on it, as a film in two of its libraries', () => {
		const twoLibraries = {...show, _serverId: 'a', _mergedCopies: [{Id: '2', _serverId: 'a'}]};
		const corner = serverNameCorner({css, item: twoLibraries, showServerBadge: true, showIndicators: true, showUnplayedCount: true});
		expect(corner.showsServerName).toBe(true);
	});
});
