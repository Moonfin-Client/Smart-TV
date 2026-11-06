// What each setup step offers and where the same setting lives in Settings.
// setupSteps.test.js holds these paths to the settings schema.

import $L from '@enact/i18n/$L';

export const STEP_INFO = {
	navbar: {
		settingKey: 'navbarPosition',
		settingName: () => $L('Navigation Style'),
		crumbs: () => [$L('Settings'), $L('Appearance'), $L('Navigation Bar')],
		options: () => [
			{value: 'top', label: $L('Top Bar'), desc: $L('Tabs across the top of the screen.')},
			{value: 'left', label: $L('Left Sidebar'), desc: $L('A slim rail of icons down the left side.')}
		]
	},
	mediaBar: {
		settingKey: 'featuredBarStyle',
		settingName: () => $L('Media Bar Style'),
		crumbs: () => [$L('Settings'), $L('Appearance'), $L('Home Screen'), $L('Media Bar')],
		options: () => [
			{value: 'moonfin', label: $L('Moonfin'), desc: $L('Large artwork with the title, details and overview laid over it.')},
			{value: 'makd', label: $L('MakD'), desc: $L('Large artwork led by a big title logo.')},
			{value: 'bookshelf', label: $L('Bookshelf'), desc: $L('Titles shelved as book spines, with the featured one face out.')},
			{value: 'gallery', label: $L('Gallery'), desc: $L('The featured title opened up, with the next few lined up beside it.')},
			{value: 'banner', label: $L('Banner'), desc: $L('A shorter banner above your rows, so more of them fit on screen.')},
			{value: 'aya', label: $L('Aya'), desc: $L('Artwork first in a framed panel, with your rows right underneath.')},
			{value: 'off', label: $L('Off'), desc: $L('No featured area. Home opens straight onto your rows.')}
		]
	},
	homeRows: {
		settingKey: 'homeRowsStyle',
		settingName: () => $L('Row Type'),
		crumbs: () => [$L('Settings'), $L('Appearance'), $L('Home Screen')],
		options: () => [
			{value: 'v1', label: $L('Classic'), desc: $L('Compact. More rows on screen at once.')},
			{value: 'v2', label: $L('Modern'), desc: $L('Larger cards with titles underneath.')}
		]
	},
	detailStyle: {
		settingKey: 'detailScreenStyle',
		settingName: () => $L('Details Screen Style'),
		crumbs: () => [$L('Settings'), $L('Appearance'), $L('Details Page')],
		options: () => [
			{value: 'v1', label: $L('Classic'), desc: $L('Everything centred in one stack.')},
			{value: 'v2', label: $L('Modern'), desc: $L('Cinematic, with tabs for cast and extras.')},
			{value: 'v3', label: $L('Spotlight'), desc: $L('Hero-first, with pop-up cards for cast and extras.')},
			{value: 'v4', label: $L('Nouveau'), desc: $L('Full-screen, with sections stacked instead of tabs.')},
			{value: 'v5', label: $L('Minimalist'), desc: $L('Artwork, one play button and the episodes.')},
			{value: 'v6', label: $L('Stage'), desc: $L('The poster up front, with play under it and the details beside it.')},
			{value: 'v7', label: $L('Premiere'), desc: $L('The title centered over a full screen backdrop, with everything else down the page.')},
			{value: 'v8', label: $L('Quick Look'), desc: $L('A drawer over the screen you were on, with play and the basics, and the full page a press away.')},
			{value: 'v9', label: $L('Frost'), desc: $L('The title in a glass window over its blurred art, with tabs under the buttons.')}
		]
	},
	// The tour's rows are the built-in themes, which the wizard reads from the
	// theme registry, so it has no options of its own here.
	tour: {
		settingName: () => $L('App Theme'),
		crumbs: () => [$L('Settings'), $L('Appearance')]
	}
};

// Under the playback languages panel on the tour.
export const LANGUAGE_PATH = {
	crumbs: () => [$L('Settings'), $L('Playback')],
	settingName: () => `${$L('Audio')}, ${$L('Subtitles')}`
};

// Every theme row on the tour says the same thing about what else is in Settings.
export const tourDescription = () => `${$L('There is more waiting in Settings')}: ${[
	$L('Seerr requests'),
	$L('SyncPlay watch parties'),
	$L('Live TV'),
	$L('Custom themes'),
	$L('And plenty more')
].join(' · ')}`;
