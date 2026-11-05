import {render, screen} from '@testing-library/react';

import {sectionVisibility} from '../../../utils/detailSectionLayout';
import SpotlightDetailContent from './SpotlightDetailContent';

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
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('@enact/spotlight', () => ({__esModule: true, default: {focus: jest.fn(() => true)}}));
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => {
	const React = require('react');
	return {__esModule: true, default: () => ({children}) => React.createElement('div', null, children)};
});

// Only the hero title is under test, so everything drawn around it stays out of the way.
jest.mock('../../../components/RatingsRow', () => () => null);
jest.mock('../../../components/IncompleteBadge', () => ({IncompleteDetailLine: () => null}));
jest.mock('../../../components/seerr/SeerrStatusBadge', () => ({SeerrStatusBadge: () => null, SeerrDownloadBars: () => null}));
jest.mock('../../../components/seerr/SeerrSections', () => ({seerrChipCount: () => 0}));
jest.mock('../../../context/SeerrContext', () => ({useSeerr: () => ({isEnabled: false})}));
jest.mock('../ExpandableOverview', () => () => null);
jest.mock('../ModernActionButtons', () => () => null);
jest.mock('./SpotlightSummaryCard', () => () => null);
jest.mock('./SpotlightSectionModal', () => () => null);
jest.mock('../nouveau/sections/NouveauSortDialog', () => () => null);
jest.mock('../../../utils/scrimImage', () => ({scrimStyle: () => ({})}));

const alien3 = {
	Id: 'movie-alien-3',
	Name: 'Alien 3',
	Type: 'Movie',
	MediaSources: [
		{Id: 'src-theatrical', Name: 'Theatrical Cut'},
		{Id: 'src-assembly', Name: 'Assembly Cut'}
	]
};

const renderSpotlight = ({item = alien3, hidden = [], ...over} = {}) => render(
	<SpotlightDetailContent
		item={item}
		settings={{}}
		showsSection={sectionVisibility(hidden)}
		seerr={{pieces: {}, statusPills: []}}
		mediaSource={item.MediaSources[1]}
		hasMultipleVersions={item.MediaSources.length > 1}
		{...over}
	/>
);

describe('SpotlightDetailContent version badge', () => {
	it('names the picked version of a movie that has more than one', () => {
		renderSpotlight();
		expect(screen.getByText('[ Assembly Cut ]')).toBeTruthy();
	});

	it('leaves the badge out when its section is hidden', () => {
		renderSpotlight({hidden: ['versionBadge']});
		expect(screen.queryByText('[ Assembly Cut ]')).toBeNull();
	});

	it('leaves the badge off a movie with a single version', () => {
		renderSpotlight({item: {...alien3, MediaSources: [alien3.MediaSources[0]]}, mediaSource: alien3.MediaSources[0]});
		expect(screen.queryByText('[ Theatrical Cut ]')).toBeNull();
	});
});
