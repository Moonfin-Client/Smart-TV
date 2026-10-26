import {useRef, useCallback, useEffect} from 'react';
import {useSettings} from '../context/SettingsContext';
import * as jellyfinApi from '../services/jellyfinApi';
import {withPlexToken} from '../utils/plexUrls';

const FADE_DURATION = 1500;
const FADE_INTERVAL = 50;
const HOME_ROW_DELAY = 1500;

// A Plex theme's id is the path it plays from.
const buildAudioUrl = (itemId) => {
	const server = jellyfinApi.getServerUrl();
	const token = jellyfinApi.getApiKey();
	if (jellyfinApi.getServerType() === 'plex') return withPlexToken(`${server}${itemId}`, token);
	return `${server}/Audio/${encodeURIComponent(itemId)}/stream?static=true&audioCodec=mp3&audioBitrate=128000&${jellyfinApi.getTokenParam()}=${encodeURIComponent(token)}`;
};

export const useThemeMusic = () => {
	const {settings} = useSettings();
	const audioRef = useRef(null);
	const currentItemIdRef = useRef(null);
	const fadeTimerRef = useRef(null);
	const delayTimerRef = useRef(null);
	const targetVolumeRef = useRef(0);
	// Set while a card preview plays. The track fades out, and the item that was
	// playing or the last one asked for is kept so it can come back afterwards.
	const heldRef = useRef(false);
	const heldItemIdRef = useRef(null);
	const requestedItemIdRef = useRef(null);

	const getTargetVolume = useCallback(() => {
		return Math.max(0, Math.min(100, settings.themeMusicVolume || 30)) / 100;
	}, [settings.themeMusicVolume]);

	const clearFade = useCallback(() => {
		if (fadeTimerRef.current) {
			clearInterval(fadeTimerRef.current);
			fadeTimerRef.current = null;
		}
	}, []);

	const stopImmediate = useCallback(() => {
		clearFade();
		if (delayTimerRef.current) {
			clearTimeout(delayTimerRef.current);
			delayTimerRef.current = null;
		}
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.src = '';
			audioRef.current = null;
		}
		currentItemIdRef.current = null;
	}, [clearFade]);

	const fadeIn = useCallback((audio) => {
		clearFade();
		const target = getTargetVolume();
		targetVolumeRef.current = target;
		audio.volume = 0;
		const steps = FADE_DURATION / FADE_INTERVAL;
		let step = 0;
		fadeTimerRef.current = setInterval(() => {
			step++;
			if (step >= steps) {
				audio.volume = target;
				clearFade();
			} else {
				audio.volume = (step / steps) * target;
			}
		}, FADE_INTERVAL);
	}, [clearFade, getTargetVolume]);

	const fadeOutAndStop = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return;
		clearFade();
		const startVolume = audio.volume;
		if (startVolume <= 0) {
			stopImmediate();
			return;
		}
		const steps = FADE_DURATION / FADE_INTERVAL;
		let step = 0;
		fadeTimerRef.current = setInterval(() => {
			step++;
			if (step >= steps) {
				stopImmediate();
			} else {
				audio.volume = startVolume * (1 - step / steps);
			}
		}, FADE_INTERVAL);
	}, [clearFade, stopImmediate]);

	const playThemeMusic = useCallback(async (itemId) => {
		if (!settings.themeMusicEnabled) return;
		if (!itemId) return;
		if (heldRef.current) {
			heldItemIdRef.current = itemId;
			return;
		}

		if (currentItemIdRef.current === itemId && audioRef.current) return;

		stopImmediate();
		currentItemIdRef.current = itemId;

		try {
			const result = await jellyfinApi.api.getThemeSongs(itemId, true);
			const songs = result?.Items || [];
			if (songs.length === 0 || currentItemIdRef.current !== itemId || heldRef.current) return;

			const song = songs[Math.floor(Math.random() * songs.length)];
			const url = buildAudioUrl(song.Id);

			const audio = new window.Audio();
			// A profile synced from another client can hold null here, which keeps
			// the looping the track always did.
			audio.loop = settings.themeMusicLoop !== false;
			audio.volume = 0;
			audioRef.current = audio;

			audio.addEventListener('canplaythrough', () => {
				if (currentItemIdRef.current === itemId && audioRef.current === audio) {
					audio.play().then(() => fadeIn(audio)).catch(() => {});
				}
			}, {once: true});

			audio.addEventListener('error', () => {
				if (audioRef.current === audio) {
					stopImmediate();
				}
			}, {once: true});

			audio.src = url;
		} catch {
			if (currentItemIdRef.current === itemId) {
				currentItemIdRef.current = null;
			}
		}
	}, [settings.themeMusicEnabled, settings.themeMusicLoop, stopImmediate, fadeIn]);

	const playThemeMusicDelayed = useCallback((itemId) => {
		if (!settings.themeMusicEnabled || !settings.themeMusicOnHomeRows) return;
		if (!itemId) return;
		requestedItemIdRef.current = itemId;
		if (heldRef.current) {
			heldItemIdRef.current = itemId;
			return;
		}

		if (delayTimerRef.current) {
			clearTimeout(delayTimerRef.current);
		}

		if (currentItemIdRef.current === itemId && audioRef.current) return;

		delayTimerRef.current = setTimeout(() => {
			delayTimerRef.current = null;
			playThemeMusic(itemId);
		}, HOME_ROW_DELAY);
	}, [settings.themeMusicEnabled, settings.themeMusicOnHomeRows, playThemeMusic]);

	const cancelDelayed = useCallback(() => {
		if (delayTimerRef.current) {
			clearTimeout(delayTimerRef.current);
			delayTimerRef.current = null;
		}
	}, []);

	// A card preview takes the speakers while it plays. Holding fades the track out
	// and keeps the item, releasing re-arms the home row delay for it, so the music
	// comes back the way it would after a focus.
	const holdThemeMusic = useCallback((held) => {
		if (heldRef.current === !!held) return;
		heldRef.current = !!held;
		if (held) {
			heldItemIdRef.current = currentItemIdRef.current || requestedItemIdRef.current;
			cancelDelayed();
			fadeOutAndStop();
			return;
		}
		const itemId = heldItemIdRef.current;
		heldItemIdRef.current = null;
		if (itemId) playThemeMusicDelayed(itemId);
	}, [cancelDelayed, fadeOutAndStop, playThemeMusicDelayed]);

	useEffect(() => {
		if (audioRef.current && targetVolumeRef.current > 0) {
			const newTarget = getTargetVolume();
			targetVolumeRef.current = newTarget;
			if (!fadeTimerRef.current) {
				audioRef.current.volume = newTarget;
			}
		}
	}, [getTargetVolume]);

	// Nothing else stops the track once the app leaves the screen, so standby leaves a
	// looping theme playing out of the speakers. Older sets only fire the prefixed
	// event, so both are watched.
	useEffect(() => {
		const stopWhenHidden = () => {
			if (document.hidden || document.webkitHidden) stopImmediate();
		};
		document.addEventListener('visibilitychange', stopWhenHidden);
		document.addEventListener('webkitvisibilitychange', stopWhenHidden);
		return () => {
			document.removeEventListener('visibilitychange', stopWhenHidden);
			document.removeEventListener('webkitvisibilitychange', stopWhenHidden);
		};
	}, [stopImmediate]);

	useEffect(() => {
		return () => stopImmediate();
	}, [stopImmediate]);

	return {
		playThemeMusic,
		playThemeMusicDelayed,
		cancelDelayed,
		holdThemeMusic,
		stopThemeMusic: fadeOutAndStop,
		stopThemeMusicImmediate: stopImmediate,
		isPlaying: () => !!(audioRef.current && !audioRef.current.paused)
	};
};
