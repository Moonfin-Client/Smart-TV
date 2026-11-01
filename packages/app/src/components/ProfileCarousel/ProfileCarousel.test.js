import {fireEvent, render, screen} from '@testing-library/react';

import ProfileCarousel from './ProfileCarousel';

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
// Spotlight's Left and Right arrive as arrow keys on the element.
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({onSpotlightLeft, onSpotlightRight, ...props}) => React.createElement(type, {
		...props,
		className: `${props.className || ''} spottable`,
		onKeyDown: (e) => {
			if (e.key === 'ArrowLeft') onSpotlightLeft?.(e);
			if (e.key === 'ArrowRight') onSpotlightRight?.(e);
		}
	});
});

const items = ['Alex', 'Jordan', 'Sam', 'Kids'].map((name, i) => ({
	key: `u${i}`,
	id: `u${i}`,
	name,
	lines: [{text: `${name} line`}],
	removable: i !== 0
}));

const strip = () => document.querySelector('.spottable');
const heroName = () => document.querySelector('.name').textContent;

describe('ProfileCarousel', () => {
	it('starts on the given face and shows its name, line and a dot per face', () => {
		render(<ProfileCarousel items={items} initialIndex={1} />);
		expect(heroName()).toBe('Jordan');
		expect(screen.getByText('Jordan line')).toBeTruthy();
		expect(document.querySelectorAll('.dots > span')).toHaveLength(4);
	});

	it('moves with Left and Right and stops at the ends', () => {
		render(<ProfileCarousel items={items} />);
		fireEvent.keyDown(strip(), {key: 'ArrowLeft'});
		expect(heroName()).toBe('Alex');
		fireEvent.keyDown(strip(), {key: 'ArrowRight'});
		fireEvent.keyDown(strip(), {key: 'ArrowRight'});
		fireEvent.keyDown(strip(), {key: 'ArrowRight'});
		fireEvent.keyDown(strip(), {key: 'ArrowRight'});
		expect(heroName()).toBe('Kids');
	});

	it('opens the middle face on OK and on a click on it, while a click beside it only moves', () => {
		const onActivate = jest.fn();
		render(<ProfileCarousel items={items} onActivate={onActivate} />);
		fireEvent.click(strip());
		expect(onActivate).toHaveBeenLastCalledWith(items[0], 0);

		fireEvent.click(document.querySelector('[data-index="1"] .avatar'));
		expect(onActivate).toHaveBeenCalledTimes(1);
		expect(heroName()).toBe('Jordan');

		fireEvent.click(document.querySelector('[data-index="1"] .avatar'));
		expect(onActivate).toHaveBeenLastCalledWith(items[1], 1);
	});

	it('offers remove on the middle face only when it can be removed, without opening it', () => {
		const onActivate = jest.fn();
		const onRemove = jest.fn();
		render(<ProfileCarousel items={items} onActivate={onActivate} onRemove={onRemove} />);
		expect(document.querySelector('.removeBtn')).toBeNull();

		fireEvent.keyDown(strip(), {key: 'ArrowRight'});
		const remove = document.querySelectorAll('.removeBtn');
		expect(remove).toHaveLength(1);
		fireEvent.click(remove[0]);
		expect(onRemove).toHaveBeenCalledWith(items[1]);
		expect(onActivate).not.toHaveBeenCalled();
	});

	it('draws initials in the id color, and falls back to them when the picture fails', () => {
		render(<ProfileCarousel items={[{...items[0], imageUrl: 'http://x/a.jpg'}, items[1]]} />);
		const second = document.querySelector('[data-index="1"] .initials');
		expect(second.textContent).toBe('J');
		// "u1" is 117 + 49 = 166, and 166 % 6 = 4
		expect(second.style.backgroundColor).toBe('rgb(184, 50, 128)');

		fireEvent.error(document.querySelector('[data-index="0"] img'));
		expect(document.querySelector('[data-index="0"] .initials').textContent).toBe('A');
	});

	it('keeps the selection on the list when it shrinks', () => {
		const {rerender} = render(<ProfileCarousel items={items} initialIndex={3} />);
		rerender(<ProfileCarousel items={items.slice(0, 2)} initialIndex={3} />);
		expect(heroName()).toBe('Jordan');
	});
});
