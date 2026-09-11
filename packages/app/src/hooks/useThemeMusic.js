import {useRef, useCallback, useEffect} from 'react';
import {useSettings} from '../context/SettingsContext';
import * as jellyfinApi from '../services/jellyfinApi';
import {fetchWithTimeout} from '../utils/fetchTimeout';

const FADE_DURATION = 1500;
const FADE_INTERVAL = 50;
const HOME_ROW_DELAY = 1500;

// The token used to ride in the query string here, which leaks it into network
// logs and browser history. It now goes in an Authorization header instead and
// the response is played back from a revocable Blob URL.
const buildAudioUrl = (itemId) => {
	const server = jellyfinApi.getServerUrl();
	return `${server}/Audio/${encodeURIComponent(itemId)}/stream?static=true&audioCodec=mp3&audioBitrate=128000`;
};

const fetchAudioBlobUrl = async (itemId) => {
	const res = await fetchWithTimeout(buildAudioUrl(itemId), {
		headers: {Authorization: jellyfinApi.getAuthHeader()}
	}, 20000);
	if (!res.ok) throw new Error(`Theme audio fetch error: ${res.status}`);
	const blob = await res.blob();
	return URL.createObjectURL(blob);
};

export const useThemeMusic = () => {
	const {settings} = useSettings();
	const audioRef = useRef(null);
	const currentItemIdRef = useRef(null);
	const fadeTimerRef = useRef(null);
	const delayTimerRef = useRef(null);
	const targetVolumeRef = useRef(0);
	const blobUrlRef = useRef(null);

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
		if (blobUrlRef.current) {
			URL.revokeObjectURL(blobUrlRef.current);
			blobUrlRef.current = null;
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

		if (currentItemIdRef.current === itemId && audioRef.current) return;

		stopImmediate();
		currentItemIdRef.current = itemId;

		try {
			const result = await jellyfinApi.api.getThemeSongs(itemId, true);
			const songs = result?.Items || [];
			if (songs.length === 0 || currentItemIdRef.current !== itemId) return;

			const song = songs[Math.floor(Math.random() * songs.length)];
			const url = await fetchAudioBlobUrl(song.Id);
			if (currentItemIdRef.current !== itemId) {
				URL.revokeObjectURL(url);
				return;
			}

			const audio = new window.Audio();
			// A profile synced from another client can hold null here, which keeps
			// the looping the track always did.
			audio.loop = settings.themeMusicLoop !== false;
			audio.volume = 0;
			audioRef.current = audio;
			blobUrlRef.current = url;

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
		stopThemeMusic: fadeOutAndStop,
		stopThemeMusicImmediate: stopImmediate,
		isPlaying: () => !!(audioRef.current && !audioRef.current.paused)
	};
};
