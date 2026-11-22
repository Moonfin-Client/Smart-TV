import {useCallback, useLayoutEffect} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import LoopMarquee from '../LoopMarquee';
import {runPlayerCommand} from '../../services/remoteControl';
import {getServerUrl} from '../../services/jellyfinApi';
import {artUrlFor, IconMusicNote} from '../../views/Player/audio/audioArt';
import {SpottableButton, SpottableDiv, IconPrevious, IconPlay, IconPause, IconNext, IconStop} from '../../views/Player/PlayerConstants';
import {CONTENT_FOCUS_TARGETS, focusContentFromSidebar, focusFirstContentTarget} from '../../utils/navFocusTargets';
import {KEYS} from '../../utils/keys';

import css from './MiniMusicPlayer.module.less';

// Left, right and down stop at the edges instead of wandering into the nav around it.
const ControlsContainer = SpotlightContainerDecorator({leaveFor: {left: '', right: '', down: ''}}, 'div');

const previous = () => runPlayerCommand('previous');
const playPause = () => runPlayerCommand('playPause');
const next = () => runPlayerCommand('next');
const stop = () => runPlayerCommand('stop');

// The mini player goes away with the music, so focus still inside it moves up to Home. A layout
// effect cleans up before its buttons leave the page, while focus can still be seen on them.
const useFocusHomeOnRemove = () => useLayoutEffect(() => () => {
	const mini = document.querySelector('[data-spotlight-id="navbar-music"]');
	if (mini && mini.contains(document.activeElement)) Spotlight.focus('navbar-home');
}, []);

const artistOf = (item) => item.AlbumArtist || item.Artists?.[0] || '';

const Art = ({item, className}) => {
	const url = artUrlFor(item, getServerUrl());
	return (
		<div className={className}>
			{url ? <img className={css.artImg} src={url} alt="" /> : <IconMusicNote />}
		</div>
	);
};

const Controls = ({paused, buttonClass, playClass}) => (
	<>
		<SpottableButton className={buttonClass} onClick={previous} aria-label={$L('Previous')}><IconPrevious /></SpottableButton>
		<SpottableButton className={playClass ? `${buttonClass} ${playClass}` : buttonClass} onClick={playPause} aria-label={paused ? $L('Play') : $L('Pause')}>
			{paused ? <IconPlay /> : <IconPause />}
		</SpottableButton>
		<SpottableButton className={buttonClass} onClick={next} aria-label={$L('Next')}><IconNext /></SpottableButton>
		<SpottableButton className={buttonClass} onClick={stop} aria-label={$L('Stop')}><IconStop /></SpottableButton>
	</>
);

// The pill under the top nav. Up goes back to Home and down carries on to the
// content, the way down from the nav itself does.
export const NavMusicPill = ({item, paused, onOpen, style}) => {
	useFocusHomeOnRemove();
	const handleKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.UP && e.keyCode !== KEYS.DOWN) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.keyCode === KEYS.UP) Spotlight.focus('navbar-home');
		else focusFirstContentTarget(CONTENT_FOCUS_TARGETS, 'down');
	}, []);

	const artist = artistOf(item);
	return (
		<ControlsContainer className={css.pill} style={style} onKeyDown={handleKeyDown} spotlightId="navbar-music">
			<Art item={item} className={css.pillArt} />
			<SpottableDiv className={css.pillTitle} onClick={onOpen} spotlightId="navbar-music-title">
				<LoopMarquee className={css.pillTitleText} text={artist ? `${item.Name} - ${artist}` : item.Name} active />
			</SpottableDiv>
			<div className={css.pillButtons}>
				<Controls paused={paused} buttonClass={css.pillBtn} />
			</div>
		</ControlsContainer>
	);
};

// The rail opens as soon as it holds focus or a pointer, so the collapsed art is
// only ever looked at. The open card takes the remote instead.
export const SidebarMusicCard = ({item, paused, expanded, onOpen}) => {
	useFocusHomeOnRemove();
	// The rail sends every right press to the content, so the card walks its own
	// row and only lets right through once it runs out of buttons.
	const handleKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.LEFT && e.keyCode !== KEYS.RIGHT) return;
		e.preventDefault();
		e.stopPropagation();
		const right = e.keyCode === KEYS.RIGHT;
		if (!Spotlight.move(right ? 'right' : 'left') && right) {
			focusContentFromSidebar();
		}
	}, []);

	if (!expanded) return <Art item={item} className={css.railArt} />;

	return (
		<ControlsContainer className={css.card} onKeyDown={handleKeyDown} spotlightId="navbar-music">
			<SpottableDiv className={css.cardInfo} onClick={onOpen}>
				<Art item={item} className={css.cardArt} />
				<div className={css.cardText}>
					<div className={css.cardTitle}>{item.Name}</div>
					<div className={css.cardArtist}>{artistOf(item)}</div>
				</div>
			</SpottableDiv>
			<div className={css.cardButtons}>
				<Controls paused={paused} buttonClass={css.cardBtn} playClass={css.cardPlay} />
			</div>
		</ControlsContainer>
	);
};
