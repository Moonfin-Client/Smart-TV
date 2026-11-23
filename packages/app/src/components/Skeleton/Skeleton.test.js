import {render} from '@testing-library/react';

import {SkeletonBox, SkeletonShimmer} from './SkeletonShimmer';
import SkeletonHomeRow from './SkeletonHomeRow';
import LibrarySkeleton from '../../views/Library/LibrarySkeleton';
import DetailSkeleton from '../../views/Details/DetailSkeleton';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
// Children written side by side arrive as an array, and are spread so React doesn't ask for keys.
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

// The grid helpers the library placeholder sizes itself with sit beside Spotlight's key handling,
// which needs the copy of React this test doesn't use.
jest.mock('@enact/spotlight', () => ({__esModule: true, default: {}}));

// The placeholders are plain boxes with no text or role to find them by.
const all = (selector) => document.querySelectorAll(selector);
const find = (selector) => document.querySelector(selector);

describe('SkeletonShimmer', () => {
	test('breathes once however deep the placeholders are nested', () => {
		render(
			<SkeletonShimmer className="outer">
				<SkeletonShimmer className="inner">
					<SkeletonBox width={10} height={10} />
				</SkeletonShimmer>
			</SkeletonShimmer>
		);

		expect(find('.outer').className).toBe('shimmer outer');
		expect(find('.inner').className).toBe('inner');
		expect(all('.shimmer')).toHaveLength(1);
	});

	test('sizes a box in pixels, or leaves a stylesheet to size it', () => {
		render(<SkeletonBox width={120} height="2rem" radius={4} />);

		expect(find('.box').style.width).toBe('120px');
		expect(find('.box').style.height).toBe('2rem');
		expect(find('.box').style.borderRadius).toBe('4px');
	});
});

describe('SkeletonHomeRow', () => {
	test('draws a classic card with one line of text under it', () => {
		render(<SkeletonHomeRow cardWidth={240} imageHeight={360} count={3} />);

		expect(all('.homeCard')).toHaveLength(3);
		expect(find('.homeCard').style.width).toBe('10rem');
		expect(find('.homeCard .box').style.height).toBe('15rem');
		expect(find('.homeCard .box').style.borderRadius).toBe('8px');
		expect(find('.classicTitleBar').style.width).toBe('7.5rem');
		expect(find('.modernSubtitleBar')).toBeNull();
	});

	test('draws a modern card with a title and a subtitle under it', () => {
		render(<SkeletonHomeRow cardWidth={240} imageHeight={360} isModern />);

		expect(all('.homeCard')).toHaveLength(8);
		expect(find('.homeCard .box').style.borderRadius).toBe('12px');
		expect(find('.modernTitleBar').style.width).toBe('7.5rem');
		expect(find('.modernSubtitleBar').style.width).toBe('5rem');
	});
});

describe('LibrarySkeleton', () => {
	const grid = {gridWidth: 1746, cardWidth: 145, posterHeight: 217, padX: 9, minRowGap: 6, showText: true};

	test('lays cells out the way the grid stretches them across the width', () => {
		render(<LibrarySkeleton {...grid} />);
		const cell = find('.skeletonCell');

		expect(find('.skeletonGrid')).not.toBeNull();
		expect(all('.skeletonCell')).toHaveLength(20);
		expect([cell.style.width, cell.style.height, cell.style.padding]).toEqual(['174px', '311px', '7px 9px']);
		expect(find('.skeletonTitle')).not.toBeNull();
	});

	test('leaves the text out when cards show none', () => {
		render(<LibrarySkeleton {...grid} showText={false} />);

		expect(find('.skeletonTitle')).toBeNull();
		expect(find('.skeletonSubtitle')).toBeNull();
	});

	test('runs a single row off the side of a horizontal grid', () => {
		render(<LibrarySkeleton {...grid} horizontal />);

		expect(find('.skeletonRow')).not.toBeNull();
		expect(all('.skeletonCell')).toHaveLength(10);
		expect(find('.skeletonCell').style.width).toBe('163px');
	});
});

describe('DetailSkeleton', () => {
	test('draws the layout of the style that was picked', () => {
		const drawn = (detailStyle) => {
			const {unmount} = render(<DetailSkeleton detailStyle={detailStyle} />);
			const found = {
				classic: all('.classicTile').length,
				modern: all('.modernBackdrop').length,
				spotlight: all('.spotlightCard').length,
				nouveau: all('.nouveauBackdrop').length,
				minimalist: all('.minimalistContent').length
			};
			unmount();
			return found;
		};

		expect(drawn('v1')).toEqual({classic: 5, modern: 0, spotlight: 0, nouveau: 0, minimalist: 0});
		expect(drawn('v2')).toEqual({classic: 0, modern: 1, spotlight: 0, nouveau: 0, minimalist: 0});
		expect(drawn('v3')).toEqual({classic: 0, modern: 0, spotlight: 3, nouveau: 0, minimalist: 0});
		expect(drawn('v4')).toEqual({classic: 0, modern: 0, spotlight: 0, nouveau: 1, minimalist: 0});
		expect(drawn('v5')).toEqual({classic: 0, modern: 0, spotlight: 0, nouveau: 0, minimalist: 1});
		expect(drawn('unknown')).toEqual({classic: 0, modern: 1, spotlight: 0, nouveau: 0, minimalist: 0});
	});

	test('moves the content over for a navbar on the left, and less for a sidebar with no rail', () => {
		const rem = (px) => px / 24 + 'rem';
		const left = (props) => {
			const {unmount} = render(<DetailSkeleton {...props} />);
			const padding = find('.content').style.paddingLeft;
			unmount();
			return padding;
		};
		expect(left({detailStyle: 'v2'})).toBe(rem(58));
		expect(left({detailStyle: 'v2', sideRoom: 'rail'})).toBe(rem(174));
		expect(left({detailStyle: 'v2', sideRoom: 'control'})).toBe(rem(120));
		// Premiere's own inset already clears the resting control.
		expect(left({detailStyle: 'v7', sideRoom: 'control'})).toBe(rem(154));
	});
});
