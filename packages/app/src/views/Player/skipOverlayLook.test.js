import {resolveSkipOverlayLook, SKIP_DEFAULTS, SKIP_LAYOUTS, skipAccentDefault, skipDefaultFill, skipDefaultText, skipPromptKinds} from './skipOverlayLook';
import {defaultSettings} from '../../context/defaultSettings';

const look = (changes = {}) => resolveSkipOverlayLook({...defaultSettings, ...changes});

describe('resolveSkipOverlayLook', () => {
	it('adds nothing when every setting is at its default, so the stylesheet draws the prompt as before', () => {
		const result = look();
		expect(result.overlay).toBeUndefined();
		expect(result.button).toEqual({});
		expect(result.icon).toBeUndefined();
		expect(result.timer).toBeUndefined();
		expect(result.ringTrack).toBeUndefined();
		expect(result.ringValue).toBeUndefined();
		expect(result.accent).toBe('');
	});

	it('ships defaults that match the stylesheet', () => {
		expect(defaultSettings.skipOverlayLayout).toBe(SKIP_DEFAULTS.layout);
		expect(defaultSettings.skipOverlayPosition).toBe(SKIP_DEFAULTS.position);
		expect(defaultSettings.skipOverlaySize).toBe(SKIP_DEFAULTS.size);
		expect(defaultSettings.skipOverlayOpacity).toBe(SKIP_DEFAULTS.opacity);
		expect(defaultSettings.skipOverlayBackground).toBe('');
		expect(defaultSettings.skipOverlayAccent).toBe('');
		expect(defaultSettings.skipOverlayText).toBe('');
	});

	describe('position', () => {
		it.each([
			['topLeft', {left: '35px', top: '60px', right: 'auto', bottom: 'auto'}],
			['topRight', {right: '35px', top: '60px', left: 'auto', bottom: 'auto'}],
			['bottomLeft', {left: '35px', bottom: '174px', right: 'auto', top: 'auto'}]
		])('pins %s to its corner', (position, expected) => {
			const {overlay} = look({skipOverlayPosition: position});
			expect(overlay).toMatchObject(expected);
			expect(overlay.transform).toBeUndefined();
		});

		it('centers on the axes that are centered and nowhere else', () => {
			expect(look({skipOverlayPosition: 'topCenter'}).overlay).toMatchObject({left: '50%', top: '60px', transform: 'translateX(-50%)', transformOrigin: 'center top'});
			expect(look({skipOverlayPosition: 'middleRight'}).overlay).toMatchObject({right: '35px', top: '50%', transform: 'translateY(-50%)', transformOrigin: 'right center'});
			expect(look({skipOverlayPosition: 'middle'}).overlay).toMatchObject({left: '50%', top: '50%', transform: 'translateX(-50%) translateY(-50%)', transformOrigin: 'center center'});
		});

		it('falls back to the default corner for a value it does not know', () => {
			expect(look({skipOverlayPosition: 'nowhere'}).overlay).toMatchObject({right: '35px', bottom: '174px'});
		});
	});

	describe('size', () => {
		it('scales about the corner the prompt is pinned to', () => {
			const {overlay} = look({skipOverlaySize: 'large'});
			expect(overlay).toMatchObject({right: '35px', bottom: '174px', transform: 'scale(1.3)', transformOrigin: 'right bottom'});
			expect(overlay.WebkitTransform).toBe('scale(1.3)');
		});

		it('scales after centering so a centered prompt stays centered', () => {
			expect(look({skipOverlayPosition: 'bottomCenter', skipOverlaySize: 'small'}).overlay.transform)
				.toBe('translateX(-50%) scale(0.8)');
		});
	});

	describe('colors', () => {
		it('fills with the picked color at the chosen opacity', () => {
			expect(look({skipOverlayBackground: '#ff0000', skipOverlayOpacity: 50}).button.background).toBe('rgba(255, 0, 0, 0.5)');
		});

		it('keeps the shipped fill when only the opacity moves', () => {
			expect(look({skipOverlayOpacity: 60}).button.background).toBe('rgba(30, 30, 40, 0.6)');
		});

		it('writes the accent onto the border color, icon and ring', () => {
			const result = look({skipOverlayAccent: '#00ff00'});
			expect(result.accent).toBe('#00ff00');
			expect(result.icon).toEqual({color: '#00ff00'});
			expect(result.ringValue).toEqual({stroke: '#00ff00'});
		});

		it('takes the timer and ring track from the text color at their usual strength', () => {
			const result = look({skipOverlayText: '#ffff00'});
			expect(result.button.color).toBe('#ffff00');
			expect(result.timer).toEqual({color: 'rgba(255, 255, 0, 0.5)'});
			expect(result.ringTrack).toEqual({stroke: 'rgba(255, 255, 0, 0.16)'});
		});

		it('lifts text and accent that would blend into the fill', () => {
			const result = look({skipOverlayText: '#000000', skipOverlayAccent: '#1e1e28'});
			expect(result.button.color).not.toBe('#000000');
			expect(result.accent).not.toBe('#1e1e28');
			expect(result.icon.color).toBe(result.accent);
		});

		it('judges the text against the fill that was picked, not the default one', () => {
			// Black reads on a white fill, so it is left alone there.
			expect(look({skipOverlayBackground: '#ffffff', skipOverlayText: '#000000'}).button.color).toBe('#000000');
			expect(look({skipOverlayText: '#000000'}).button.color).not.toBe('#000000');
		});

		it('ignores a value that is not a color', () => {
			const result = look({skipOverlayBackground: 'nonsense', skipOverlayText: 'nonsense', skipOverlayAccent: 'nonsense'});
			expect(result.button).toEqual({});
			expect(result.accent).toBe('');
		});
	});

	describe('skipAccentDefault', () => {
		it('starts from the color the Accent Colors page gave the Skip surface', () => {
			expect(skipAccentDefault({accentSkip: '#ff8800'})).toBe('#ff8800');
		});

		it('is the shipped cyan when nothing was picked', () => {
			expect(skipAccentDefault({accentSkip: ''})).toBe('#00a4dc');
		});
	});

	describe('layout', () => {
		it('is the capsule unless another is picked, and an unknown one is the capsule too', () => {
			expect(look().layout).toBe('capsule');
			expect(look({skipOverlayLayout: 'nonsense'}).layout).toBe('capsule');
			SKIP_LAYOUTS.forEach((layout) => expect(look({skipOverlayLayout: layout}).layout).toBe(layout));
		});

		it('offers only the capsule, the rectangle and the sweep, and sends a layout that was removed back to the capsule', () => {
			expect(SKIP_LAYOUTS).toEqual(['capsule', 'rectangle', 'sweep']);
			['outline', 'text'].forEach((layout) => expect(look({skipOverlayLayout: layout}).layout).toBe('capsule'));
		});

		it('paints the picked fill on every layout', () => {
			SKIP_LAYOUTS.forEach((layout) => {
				expect(look({skipOverlayLayout: layout, skipOverlayBackground: '#ff0000', skipOverlayOpacity: 50}).button.background).toBe('rgba(255, 0, 0, 0.5)');
			});
		});

		it('makes the rectangle a light box, so white text on it is darkened and dark text is left alone', () => {
			expect(skipDefaultFill('rectangle')).toBe('#f4f4f6');
			expect(skipDefaultText('rectangle')).toBe('#14161c');
			expect(skipDefaultFill('capsule')).toBe('#1e1e28');
			expect(skipDefaultText('capsule')).toBe('#ffffff');
			expect(look({skipOverlayLayout: 'rectangle', skipOverlayText: '#ffffff'}).button.color).not.toBe('#ffffff');
			expect(look({skipOverlayLayout: 'rectangle', skipOverlayText: '#000000'}).button.color).toBe('#000000');
			// The same black is lifted on the layouts that sit on a dark fill.
			expect(look({skipOverlayLayout: 'capsule', skipOverlayText: '#000000'}).button.color).not.toBe('#000000');
		});

		it('keeps the rectangle light when only its opacity moves', () => {
			expect(look({skipOverlayLayout: 'rectangle', skipOverlayOpacity: 60}).button.background).toBe('rgba(244, 244, 246, 0.6)');
		});

		it('colors the bar and the sweep from the accent', () => {
			const result = look({skipOverlayLayout: 'sweep', skipOverlayAccent: '#00ff00'});
			expect(result.bar).toEqual({background: '#00ff00'});
			expect(result.sweep).toEqual({background: 'rgba(0, 255, 0, 0.38)'});
			expect(look().bar).toBeUndefined();
		});
	});

	describe('skipPromptKinds', () => {
		const kinds = (changes) => skipPromptKinds({...defaultSettings, ...changes})
			.map((prompt) => (prompt.kind === 'nextUp' ? 'nextUp' : prompt.type));

		it('offers the intro, recap, credits and next episode by default', () => {
			expect(kinds({})).toEqual(['intro', 'recap', 'outro', 'nextUp']);
		});

		it('leaves out an intro or credits that skip by themselves or are off, since no button appears', () => {
			expect(kinds({introAction: 'auto'})).not.toContain('intro');
			expect(kinds({introAction: 'none'})).not.toContain('intro');
			expect(kinds({outroAction: 'auto'})).not.toContain('outro');
			expect(kinds({outroAction: 'none'})).not.toContain('outro');
		});

		it('swaps the credits for the next episode card when it is set to replace them', () => {
			expect(kinds({replaceSkipOutroWithNextUp: true})).toEqual(['intro', 'recap', 'nextUp']);
		});

		it('keeps the credits when the next episode card is off, whatever the replace setting says', () => {
			expect(kinds({replaceSkipOutroWithNextUp: true, nextUpBehavior: 'disabled'})).toEqual(['intro', 'recap', 'outro']);
			expect(kinds({nextUpBehavior: 'disabled'})).not.toContain('nextUp');
		});

		it('always has something to show, since recaps are offered whenever there is one', () => {
			expect(kinds({introAction: 'none', outroAction: 'none', nextUpBehavior: 'disabled'})).toEqual(['recap']);
		});
	});
});

