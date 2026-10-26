import {plexImageUrl, registerPlexServer} from './plexUrls';

test('a sized image goes through the photo transcoder with the token, a cast photo stays as it is', () => {
	registerPlexServer('http://plex:32400', 'tok');
	const url = plexImageUrl('http://plex:32400', '17100', 'Backdrop', {maxWidth: 1280, tag: '/library/metadata/17098/art/1'});
	expect(url).toContain('/photo/:/transcode?');
	expect(Object.fromEntries(new URL(url).searchParams)).toMatchObject({width: '1280', height: '5120', url: '/library/metadata/17098/art/1', 'X-Plex-Token': 'tok'});
	expect(plexImageUrl('http://plex:32400', 'person-1', 'Primary', {tag: 'https://metadata-static.plex.tv/p.jpg'})).toBe('https://metadata-static.plex.tv/p.jpg');
	expect(plexImageUrl('http://plex:32400', 'section-1', 'Primary', {})).toBeNull();
});
