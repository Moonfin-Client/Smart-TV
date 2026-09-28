import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import * as gamesApi from '../../services/gamesApi';
import {loadGameStateWithMigration} from '../../utils/gameSaves';
import GameDetails from './GameDetails';

jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {jsxDEV: (type, props, key, staticChildren) => {
		const config = key === undefined ? props : {...props, key};
		return staticChildren && Array.isArray(props.children)
			? React.createElement(type, config, ...props.children)
			: React.createElement(type, config);
	}};
});
jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true)}));
jest.mock('@enact/sandstone/Button', () => {
	const React = require('react');
	return ({disabled, onClick, children}) => React.createElement('button', {disabled, onClick}, children);
});
jest.mock('../../components/AdminMessageDialog', () => {
	const React = require('react');
	return ({open, message}) => (open ? React.createElement('div', null, message) : null);
});
jest.mock('../../components/GameCard', () => () => null);
jest.mock('../../components/LoadingSpinner', () => () => null);
jest.mock('../../components/TrackOptionRow', () => {
	const React = require('react');
	const TrackOptionRow = ({label, detail, onClick, selected, ...rest}) => React.createElement('button', {
		onClick,
		'data-core': rest['data-core'],
		'data-selected': selected ? 'true' : undefined
	}, React.createElement('span', null, label), detail ? React.createElement('span', null, detail) : null);
	return {__esModule: true, default: TrackOptionRow, TrackDivider: () => null};
});
jest.mock('../../utils/spotlightContainers', () => {
	const React = require('react');
	return {ModalContainer: ({className, children, onClick}) => React.createElement('div', {className, onClick}, children)};
});
jest.mock('../../services/gamesApi', () => ({getGame: jest.fn(), getGames: jest.fn(), gameThumbUrl: () => null, setGameCoreOverride: jest.fn()}));
jest.mock('../../utils/gameSaves', () => ({loadGameStateWithMigration: jest.fn()}));
jest.mock('../../utils/emulatorjs', () => ({isSupported: () => true, needsThreads: (core) => core === 'psp', unsupportedMessage: () => ''}));

const library = {Id: 'lib'};
const game = {id: 'g1', core: 'nes', title: 'Game', system: 'NES'};
const onPlay = jest.fn();

const renderDetails = () => render(<GameDetails library={library} gameId="g1" initialGame={game} onPlay={onPlay} />);
const labels = () => screen.getAllByRole('button').map((b) => b.textContent);

beforeEach(() => {
	jest.clearAllMocks();
	gamesApi.getGame.mockResolvedValue(game);
	gamesApi.getGames.mockResolvedValue([]);
});

test('holds Play while the save check is running', async () => {
	let finish;
	loadGameStateWithMigration.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

	renderDetails();
	await waitFor(() => expect(loadGameStateWithMigration).toHaveBeenCalled());

	expect(labels()).toEqual(['Checking for save…']);
	expect(screen.getByRole('button').disabled).toBe(true);

	await act(async () => finish(null));

	expect(labels()).toEqual(['Play']);
	fireEvent.click(screen.getByRole('button'));
	expect(onPlay).toHaveBeenCalledWith(library, game, {fresh: false});
});

test('offers Continue and Restart once a save is found', async () => {
	loadGameStateWithMigration.mockResolvedValue(new Uint8Array([1]));

	renderDetails();
	fireEvent.click(await screen.findByText('Restart'));

	expect(labels()).toEqual(['Continue', 'Restart']);
	expect(onPlay).toHaveBeenCalledWith(library, game, {fresh: true});
});

test('a failed save check blocks play until a retry gets an answer', async () => {
	loadGameStateWithMigration
		.mockRejectedValueOnce(Object.assign(new Error('Save fetch error: 500'), {status: 500}))
		.mockResolvedValueOnce(new Uint8Array([1]));

	renderDetails();
	fireEvent.click(await screen.findByText('Retry save check'));
	await screen.findByText('Continue');

	expect(onPlay).not.toHaveBeenCalled();
	expect(loadGameStateWithMigration).toHaveBeenCalledTimes(2);
	expect(labels()).toEqual(['Continue', 'Restart']);
});

test('checks the save from the summary when the detail request fails', async () => {
	gamesApi.getGame.mockRejectedValue(new Error('offline'));
	loadGameStateWithMigration.mockResolvedValue(null);

	renderDetails();
	await screen.findByText('Play');

	expect(loadGameStateWithMigration).toHaveBeenCalledWith('g1', 'nes');
});

const arcadeGame = {
	id: 'g1',
	core: 'arcade',
	title: 'Game',
	system: 'Arcade',
	recommendedCore: 'arcade',
	availableCores: ['arcade'],
	coreCompatibilityReason: 'Validated against the FBNeo DAT.'
};

const openArcadeGame = async (backHandlerRef) => {
	gamesApi.getGame.mockResolvedValue(arcadeGame);
	loadGameStateWithMigration.mockResolvedValue(null);
	render(<GameDetails library={library} gameId="g1" initialGame={arcadeGame} onPlay={onPlay} backHandlerRef={backHandlerRef} />);
	await screen.findByText('Play');
};

test('gives a console game no core button', async () => {
	loadGameStateWithMigration.mockResolvedValue(null);

	renderDetails();
	await screen.findByText('Play');

	expect(labels()).toEqual(['Play']);
});

test('offers FBNeo and MAME for an arcade game, with the server reason and warning', async () => {
	await openArcadeGame();

	fireEvent.click(screen.getByText('FBNeo'));

	expect(screen.getByText('FBNeo (Recommended)')).toBeTruthy();
	expect(screen.getByText('Validated against the FBNeo DAT.')).toBeTruthy();
	expect(screen.getByText('This archive is not validated for MAME and may not launch correctly.')).toBeTruthy();
	expect(screen.getByText('FBNeo (Recommended)').closest('button').getAttribute('data-selected')).toBe('true');
});

test('picking a core pins it and checks for a save under that core', async () => {
	gamesApi.setGameCoreOverride.mockResolvedValue({...arcadeGame, core: 'mame', userCoreOverride: 'mame'});
	await openArcadeGame();
	fireEvent.click(screen.getByText('FBNeo'));

	fireEvent.click(screen.getByText('MAME'));

	await screen.findByText('MAME');
	expect(gamesApi.setGameCoreOverride).toHaveBeenCalledWith('lib', 'g1', 'mame');
	await waitFor(() => expect(loadGameStateWithMigration).toHaveBeenLastCalledWith('g1', 'mame'));
	expect(screen.queryByText('Cancel')).toBeNull();
});

test('says so when the core will not change', async () => {
	gamesApi.setGameCoreOverride.mockRejectedValue(Object.assign(new Error('Games API error: 400'), {status: 400}));
	await openArcadeGame();
	fireEvent.click(screen.getByText('FBNeo'));

	fireEvent.click(screen.getByText('MAME'));

	await screen.findByText('Could not change the core.');
	expect(screen.getByText('FBNeo')).toBeTruthy();
});

test('back closes the core picker before anything else', async () => {
	const backHandlerRef = {current: null};
	await openArcadeGame(backHandlerRef);
	fireEvent.click(screen.getByText('FBNeo'));

	let handled;
	act(() => { handled = backHandlerRef.current(); });

	expect(handled).toBe(true);
	expect(screen.queryByText('Cancel')).toBeNull();
});

test('refuses a PSP game with the reason instead of starting it', async () => {
	const psp = {...game, core: 'psp', system: 'PSP'};
	gamesApi.getGame.mockResolvedValue(psp);
	loadGameStateWithMigration.mockResolvedValue(null);
	render(<GameDetails library={library} gameId="g1" initialGame={psp} onPlay={onPlay} />);

	fireEvent.click(await screen.findByText('Play'));

	expect(screen.getByText(/PSP games can't run on this TV/)).toBeTruthy();
	expect(onPlay).not.toHaveBeenCalled();
});
