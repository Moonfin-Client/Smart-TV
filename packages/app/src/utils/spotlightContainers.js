import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

// The track pickers the detail screen and the player both raise. self-only on its
// own still lets a press at the edge reach what sits behind the picker, so every
// direction is closed off as well. Explicit Spotlight.focus still crosses it,
// which is how these open and hand focus back on close.
export const ModalContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-selected="true"]',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''},
	preserveId: true
}, 'div');

// The sort and settings panels over the library, favorites and genre grids. Held the
// same way, but coming back in lands wherever the viewer left off.
export const PanelContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

// Full screen layers like the trailer and the lost connection notice. Nothing under them
// can be seen, so a press at the edge stays on the layer.
export const OverlayContainer = SpotlightContainerDecorator({
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

// A strip of tabs where the one that is open is the one the remote lands on, however far along the
// strip it sits, rather than whichever tab happens to be nearest.
export const ActiveTabContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-active-tab="true"]',
	preserveId: true
}, 'div');

