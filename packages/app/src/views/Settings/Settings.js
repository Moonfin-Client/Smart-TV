import {Fragment, useCallback, useState, useEffect, useMemo, useRef} from 'react';
import {
	hashPin, isPinShaped, pinMatches, lockoutRemaining, registerFailedAttempt, clearedLockout, tooManyAttempts, KIDS_PIN
} from '../../utils/pinLockout';
import {
	PIN_ACCEPTED, dropSignInPin, isSignInPinEnabled, refreshSignInPin, signInPinMessage, storeSignInPin, verifySignInPin
} from '../../utils/signInPin';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import {useAuth} from '../../context/AuthContext';
import {useSettings, defaultSettings, flushSettingsPush} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import {useAchievements} from '../../context/AchievementsContext';
import {useDeviceInfo} from '../../hooks/useDeviceInfo';
import {isBackKey} from '../../utils/keys';
import {isTvKeyboardVisible} from '../../components/TVKeyboard/keyboardBus';
import {isTizen, isVega, isWebOS, isXbox} from '../../platform';
import ClearDataDialog from '../../components/ClearDataDialog';
import ScreensaverPreview from '../../components/Screensaver/ScreensaverPreview';
import TrickplaySettingsPreview from '../../components/TrickplayPreview/TrickplaySettingsPreview';
import {LoadingAnimationPreview} from '../../components/LoadingAnimation';
import {clearAllStorage} from '../../services/storage';
import {clearCapabilitiesCache, getDeviceProfile} from '../../services/deviceProfile';
import {canTranscodeAudioCodecAway} from '../../utils/deviceProfileTuning';
import {clearImageCache} from '../../services/imageProxy';
import {clearProxiedImageCache} from '../../hooks/useProxiedImage';
import {detectCustomSource, validateCustomRow, buildManualCustomSource, sourceKeyForRow} from '../../utils/externalHomeRows';
import {fetchCustomRow} from '../../services/externalRowsApi';
import {checkForUpdatesDetailed} from '../../services/versionChecker';
import QrLinkView from './QrLinkView';
import {formatPlaybackTimeSlot} from '../../utils/playbackTimeLabels';
import {getSubtitleOverlayStyle, getSubtitleTextStyle} from '../../utils/subtitleConstants';
import {getImageTypeOptions, getLabel, getSubtitleLanguageOptions, getTranscodeAudioCodecOptions} from './settingsOptions';
import {MAX_SUBTITLE_DOWNLOAD_LANGUAGES} from '../Player/remoteSubtitleUtils';
import {SCHEMA_BY_KEY, SETTINGS_SCHEMA, resolve, spotlightIdOf} from './settingsSchema';
import {MIN_QUERY_LENGTH, buildSettingsIndex, matchSettings, resultSpotlightId} from './settingsSearch';
import useSeerrAccount from './useSeerrAccount';
import useRommAccount from './useRommAccount';
import useProfileSync from './useProfileSync';
import useThemeStore from './useThemeStore';
import useHomeRowsEditor from './useHomeRowsEditor';
import useButtonLayoutEditor from './useButtonLayoutEditor';
import useLibraryVisibility from './useLibraryVisibility';
import useMediaBarSources from './useMediaBarSources';
import useScreensaverSources from './useScreensaverSources';
import useDiagnosticsLog from './useDiagnosticsLog';
import {openDeviceProbe} from '../../utils/deviceProbe';
import renderDescriptorRow from './settingsDescriptorRow';
import {NavRow} from './settingsRows';
import {CategoriesView, CategoryView, OptionsDialog, SubcategoryView} from './BrowseViews';
import {SettingsEnterContext, SettingsTitleContext} from './SettingsView';
import {ThemesView, ThemeStoreView} from './ThemeViews';
import AchievementsScreens, {ACHIEVEMENT_VIEWS} from './achievements/AchievementsScreens';
import FriendsScreens, {FRIENDS_VIEWS} from './friends/FriendsScreens';
import {isConfirmSpendOpen} from './achievements/ConfirmSpendDialog';
import {kidsModeNeedsPin} from '../../utils/kidsMode';
import {sortRatingsBySeverity} from '../../utils/parentalFilter';
import {isPickedRow, isSeerrSliderRow} from '../../utils/pickedRows';
import {readServerRatings} from './serverRatings';
import {getBlockedRatings, setBlockedRatings} from '../../services/parentalControls';
import useParentalFilter from '../../hooks/useParentalFilter';
import useSignInPin from '../../hooks/useSignInPin';
import {SeerrHomeRowsView, ImdbListsView} from './HomeRowToggleViews';
import {ExternalTmdbListsView, ExternalCalendarsView, ExternalCustomRowsView, SeasonalRowView} from './ExternalRowViews';
import {RatingSourcesView, ExcludedGenresView, PinCodeView, BlockedRatingsView, RowImageTypesView, CheckListView} from './PickerViews';
import {KidsModeSetView, KidsModeExitView} from './KidsModeViews';
import HomeRowsView from './HomeRowsView';
import ButtonLayoutView from './ButtonLayoutView';
import DetailSectionsView from './DetailSectionsView';
import DiagnosticsView from './DiagnosticsView';
import LibrariesView from './LibrariesView';
import LibraryOrderView from './LibraryOrderView';
import MediaBarSourceView from './MediaBarSourceView';
import {mediaBarExternalListOptions} from '../Browse/featuredExternal';
import SeerrAccountPanel from './SeerrAccountPanel';
import RommAccountPanel from './RommAccountPanel';
import MoonbasePanel from './MoonbasePanel';
import {LOG_RENDER_STEP} from './useDiagnosticsLog';
import {DETAIL_SECTIONS_HIDDEN_KEY, toggleHiddenSection} from '../../utils/detailSectionLayout';

import css from './Settings.module.less';

// The screen being left slides out over the one it goes back to. It's a copy of the leaving
// screen with nothing in it spotlight can land on, since the real one is gone by the next render.
const LEAVE_MS = 130;
const slideOutLeavingPage = (page) => {
	if (!page || document.documentElement.classList.contains('perf-low')) return;
	const leaving = page.querySelector('[data-settings-page]');
	if (!leaving) return;
	const copy = leaving.cloneNode(true);
	copy.removeAttribute('data-settings-page');
	[copy, ...copy.querySelectorAll('*')].forEach((node) => {
		node.removeAttribute('data-spotlight-id');
		node.removeAttribute('data-spotlight-container');
		node.removeAttribute('tabindex');
		if (node.classList) node.classList.remove('spottable');
	});
	copy.setAttribute('aria-hidden', 'true');
	copy.classList.add(css.pageLeave);
	page.appendChild(copy);
	setTimeout(() => copy.remove(), LEAVE_MS + 20);
};

// The screens that open on their first row, with the container to fall back on. A screen
// shares its container's name with the one before, so the container's memory of the last
// focused row can point into that one instead.
const FIRST_ROW_VIEWS = {
	subcategory: 'subcategory-view',
	homeRows: 'homerows-view',
	buttonLayout: 'button-layout-view',
	detailSections: 'detail-sections-view',
	ratingSources: 'rating-sources-view'
};

const Settings = ({ onBack, onLibrariesChanged, onRunSetupWizard, onSelectItem, panelMode, initialView }) => {
	const { api, serverUrl, servers, accessToken, hasMultipleServers, logoutAll, activeServerInfo, user, serverType } = useAuth();
	const {
		settings, updateSetting, updateSettings, resetSettings, restoreSyncedDefaults, applyServerProfile, selectSyncProfile,
		availableThemes, activeThemeId, selectThemeById, saveStoreTheme, deleteStoreTheme
	} = useSettings();
	const { capabilities } = useDeviceInfo();
	const seerr = useSeerr();
	const achievements = useAchievements();
	const romm = useRommAccount({serverUrl, accessToken});
	const isSeerr = seerr.isMoonfin && seerr.variant === 'seerr';
	const bootLocaleRef = useRef(settings.uiLanguage);
	useEffect(() => {
		if (settings.uiLanguage !== bootLocaleRef.current &&
			typeof window !== 'undefined' && window.location) {
			// The language reaches the server on a debounce, so reloading straight
			// away drops it and the next pull hands English back.
			flushSettingsPush().then(() => window.location.reload());
		}
	}, [settings.uiLanguage]);
	const seerrLabel = isSeerr ? seerr.displayName || $L('Seerr') : $L('Seerr');
	// Category labels do not depend on anything but the locale, so they resolve without
	// the settings context, which is not built until further down. The gate only reads the
	// settings, which are in hand, and the search index already honours it the same way.
	const categories = SETTINGS_SCHEMA
		.filter((category) => !category.when || category.when({settings}))
		.map((category) => ({
			id: category.id,
			label: resolve(category.label),
			description: resolve(category.description),
			icon: category.icon
		}));

	const [searchQuery, setSearchQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	// Read by the focus effect and the back handler, both of which are registered once.
	const searchResultsRef = useRef([]);
	const searchQueryRef = useRef('');

	// Opened on a screen of its own when the shell asked for one, with the categories under it
	// so BACK still walks out the usual way.
	const [navStack, setNavStack] = useState(() => (initialView ? [{view: 'categories'}, {view: initialView}] : [{view: 'categories'}]));
	const currentView = navStack[navStack.length - 1];
	const pendingFocusRef = useRef(null);
	const navStackRef = useRef(navStack);
	navStackRef.current = navStack;

	// Which way the last move went, so a pushed screen slides in and one gone back to doesn't
	const navActionRef = useRef('none');
	const pageRef = useRef(null);

	const pushView = useCallback((view) => {
		if (view.view !== 'options') navActionRef.current = 'push';
		setNavStack((prev) => [...prev, view]);
	}, []);

	const popView = useCallback(() => {
		const stack = navStackRef.current;
		if (stack.length > 1 && stack[stack.length - 1].view !== 'options') {
			navActionRef.current = 'pop';
			slideOutLeavingPage(pageRef.current);
		}
		setNavStack((prev) => {
			if (prev.length <= 1) {
				onBack?.();
				return prev;
			}
			const popped = prev[prev.length - 1];
			pendingFocusRef.current = popped.returnFocusTo || null;
			return prev.slice(0, -1);
		});
	}, [onBack]);

	const [serverVersion, setServerVersion] = useState(null);
	const [clearDataDialogOpen, setClearDataDialogOpen] = useState(false);
	const [imageCacheCleared, setImageCacheCleared] = useState(false);
	// Null while an open is reading what ratings the libraries actually hold.
	const [availableRatings, setAvailableRatings] = useState(null);
	const [ratingsLoadFailed, setRatingsLoadFailed] = useState(false);
	const ratingsRequestRef = useRef(0);
	const {blockedRatings} = useParentalFilter();
	const [customRowsRefreshing, setCustomRowsRefreshing] = useState(false);
	const [customRowsRefreshMessage, setCustomRowsRefreshMessage] = useState('');
	const [updateCheckState, setUpdateCheckState] = useState('idle');
	const [updateCheckMessage, setUpdateCheckMessage] = useState('');
	const [ratingsResetArmed, setRatingsResetArmed] = useState(false);
	const [tempRatingSources, setTempRatingSources] = useState([]);
	const openedRatingSourcesRef = useRef('');
	const [tempExcludedGenresText, setTempExcludedGenresText] = useState('');
	const [customRowUrl, setCustomRowUrl] = useState('');
	const [customRowName, setCustomRowName] = useState('');
	const [customRowError, setCustomRowError] = useState('');
	const [customRowSaving, setCustomRowSaving] = useState(false);
	// The builder adds by pasted URL or by picking a source and typing its ids.
	const [customRowMode, setCustomRowMode] = useState('url');
	const [customRowSourceKey, setCustomRowSourceKey] = useState('tmdb_list');
	const [customRowParamA, setCustomRowParamA] = useState('');
	const [customRowParamB, setCustomRowParamB] = useState('');
	const [customRowSortBy, setCustomRowSortBy] = useState('none');
	const [customRowSortOrder, setCustomRowSortOrder] = useState('desc');
	const [customRowShowUserRatings, setCustomRowShowUserRatings] = useState(true);
	const [editingCustomRowId, setEditingCustomRowId] = useState(null);
	const [tempPinCode, setTempPinCode] = useState('');
	// What the PIN screen is for, and whether it's asking for the current PIN or a new one.
	const [pinFlow, setPinFlow] = useState(null);
	const [pinBusy, setPinBusy] = useState(false);
	const [tempKidsPin, setTempKidsPin] = useState('');
	const [kidsPinError, setKidsPinError] = useState('');
	const [pinCodeError, setPinCodeError] = useState('');

	const focusViewDefault = useCallback((cv) => {
			if (cv.view === 'categories') {
				// With a query up the categories are not mounted, so the first result is
				// the only thing there is to land on.
				const results = searchResultsRef.current;
				if (searchQueryRef.current) {
					Spotlight.focus(results.length > 0
						? resultSpotlightId(results[0])
						: 'settings-search-input');
					return;
				}
				Spotlight.focus(`cat-${categories[0]?.id || 'account'}`);
			} else if (cv.view === 'category') {
				const subcats = getSubcategories(cv.id); // eslint-disable-line no-use-before-define
				Spotlight.focus(subcats.length > 0 ? `subcat-${subcats[0].id}` : 'category-view');
			} else if (cv.view === 'options') {
				const idx = cv.options?.findIndex((o) => o.value === cv.value);
				Spotlight.focus(idx >= 0 ? `opt-${idx}` : 'opt-0');
			} else if (cv.view === 'themes') {
				const selectedId = availableThemes.find((t) => t.id === activeThemeId)?.id;
				Spotlight.focus(selectedId ? `theme-card-${selectedId}` : 'themes-view');
			} else if (cv.view === 'themeStore') {
				Spotlight.focus('theme-store-view');
			} else if (FIRST_ROW_VIEWS[cv.view]) {
				const first = document.querySelector(`[data-settings-page] .${css.listContent} .spottable`);
				Spotlight.focus(first || FIRST_ROW_VIEWS[cv.view]);
			} else if (cv.view === 'seerrHomeRows') {
				Spotlight.focus('seerr-home-rows-view');
			} else if (cv.view === 'imdbLists') {
				Spotlight.focus('imdb-lists-view');
			} else if (cv.view === 'externalTmdbLists') {
				Spotlight.focus('external-tmdb-lists-view');
			} else if (cv.view === 'externalCalendars') {
				Spotlight.focus('external-calendars-view');
			} else if (cv.view === 'externalCustomRows') {
				Spotlight.focus('external-custom-rows-view');
			} else if (cv.view === 'libraries') {
				Spotlight.focus('libraries-view');
			} else if (cv.view === 'libraryOrder') {
				Spotlight.focus('library-order-view');
			} else if (cv.view === 'blockedRatings') {
				Spotlight.focus('blocked-ratings-view');
			} else if (cv.view === 'subtitleDownloadLanguages') {
				Spotlight.focus('subtitle-download-languages-view');
			} else if (cv.view === 'transcodeAudioCodecs') {
				Spotlight.focus('transcode-audio-codecs-view');
			} else if (cv.view === 'qrLink') {
				Spotlight.focus('qr-link-close');
			} else if (cv.view === 'rowImageTypes') {
				Spotlight.focus('row-image-types-view');
			} else if (cv.view === 'excludedGenres') {
				Spotlight.focus('excluded-genres-input');
			} else if (cv.view === 'pinCode') {
				Spotlight.focus('pin-code-input');
			} else if (cv.view === 'mediaBarLibraries') {
				Spotlight.focus('media-bar-libraries-view');
			} else if (cv.view === 'mediaBarCollections') {
				Spotlight.focus('media-bar-collections-view');
			} else if (cv.view === 'mediaBarExternalLists') {
				Spotlight.focus('media-bar-external-lists-view');
			} else if (cv.view === 'screensaverLibraries') {
				Spotlight.focus('screensaver-libraries-view');
			} else if (cv.view === 'screensaverCollections') {
				Spotlight.focus('screensaver-collections-view');
			} else if (cv.view === 'screensaverGenres') {
				Spotlight.focus('screensaver-genres-view');
			} else {
				// Any screen not named above would otherwise leave focus where it
				// already was, which is outside the panel. Each screen is a single
				// container, so landing on that is always somewhere useful.
				const container = document.querySelector(`.${css.viewContainer}[data-spotlight-id]`);
				if (container) Spotlight.focus(container.getAttribute('data-spotlight-id'));
			}
	}, [categories, settings, availableThemes, activeThemeId]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		let retry = null;
		const timer = setTimeout(() => {
			const cv = navStack[navStack.length - 1];
			const target = pendingFocusRef.current;
			pendingFocusRef.current = null;
			if (!target) {
				focusViewDefault(cv);
				return;
			}
			// A deep linked row may not have attached yet on a slow TV, and its condition
			// could have flipped since the search index was built, so give it one more
			// frame before settling for the top of the screen.
			if (Spotlight.focus(target)) return;
			retry = setTimeout(() => {
				if (!Spotlight.focus(target)) focusViewDefault(cv);
			}, 180);
		}, 50);
		return () => {
			clearTimeout(timer);
			if (retry) clearTimeout(retry);
		};
	}, [navStack]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (isTvKeyboardVisible()) return;
			if (!isBackKey(e)) return;
			// A confirm is a layer of its own and closes itself on this key.
			if (isConfirmSpendOpen()) return;
			e.preventDefault();
			e.stopPropagation();
			// App.js stops back keys propagating before React sees them, so SpottableInput
			// never gets to close itself. Stepping out of the field is handled here
			// instead, which covers every input on these screens.
			if (e.target.tagName === 'INPUT') {
				let host = e.target.parentElement;
				while (host && !host.getAttribute('data-spotlight-id')) host = host.parentElement;
				e.target.blur();
				if (host) Spotlight.focus(host.getAttribute('data-spotlight-id'));
				return;
			}
			// A query is its own layer to back out of before leaving the screen.
			if (navStackRef.current.length === 1 && searchQueryRef.current) {
				setSearchQuery('');
				setDebouncedQuery('');
				Spotlight.focus('settings-search-input');
				return;
			}
			popView();
		};
		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [popView]);

	useEffect(() => {
		// Plex has no /System/Info, so its version comes from the identity call.
		if (serverUrl && serverType === 'plex') {
			api.getPublicInfo().then((info) => info?.Version && setServerVersion(info.Version)).catch(() => {});
		} else if (serverUrl && accessToken) {
			fetch(`${serverUrl}/System/Info`, {
				headers: { Authorization: `MediaBrowser Token="${accessToken}"` }
			})
				.then((res) => res.json())
				.then((data) => {
					if (data.Version) setServerVersion(data.Version);
				})
				.catch(() => {});
		}
	}, [serverUrl, accessToken, serverType, api]);

	const toggleSetting = useCallback(
		(key) => {
			updateSetting(key, !settings[key]);
		},
		[settings, updateSetting]
	);

	const refreshPlugin = useCallback(() => {
		if (serverUrl && accessToken) seerr.refreshPluginInfo(serverUrl, accessToken);
	}, [seerr, serverUrl, accessToken]);

	// The Tizen profile keeps what it detected, so the next playback only offers TrueHD once
	// that's thrown away
	const toggleExperimentalTruehd = useCallback(() => {
		updateSetting('experimentalTruehd', !settings.experimentalTruehd);
		clearCapabilitiesCache();
	}, [settings.experimentalTruehd, updateSetting]);

	const handleOptionSelect = useCallback(
		(settingKey, value) => {
			if (settingKey === '__themeSelection') {
				selectThemeById(value);
				popView();
				return;
			}
			if (settingKey === 'autoLoginBehavior' && value === 'currentUser') {
				// Pin the account that is signed in right now, so launches keep
				// coming back to it even after switching users.
				updateSetting('autoLoginServerId', activeServerInfo?.serverId || '');
				updateSetting('autoLoginUserId', activeServerInfo?.userId || '');
			}
			updateSetting(settingKey, value);
			popView();
		},
		[updateSetting, popView, selectThemeById, activeServerInfo]
	);

	const openQrLink = useCallback((label, url, returnFocusTo) => {
		pushView({view: 'qrLink', label, url, returnFocusTo});
	}, [pushView]);

	const checkForUpdatesNow = useCallback(async () => {
		if (updateCheckState === 'checking') return;
		setUpdateCheckState('checking');
		const result = await checkForUpdatesDetailed();
		if (result.status === 'update') {
			setUpdateCheckMessage($L('Version {version} is available').replace('{version}', result.latestVersion));
		} else if (result.status === 'current') {
			setUpdateCheckMessage($L('You are on the latest version'));
		} else {
			setUpdateCheckMessage($L('Could not reach the update server'));
		}
		setUpdateCheckState('done');
	}, [updateCheckState]);

	const renderCheckForUpdates = () => (
		<NavRow
			spotlightId='check-for-updates'
			title={$L('Check for Updates')}
			desc={updateCheckState === 'checking' ? $L('Checking...') : (updateCheckMessage || $L('Check for the latest Moonfin release'))}
			icon='system_update_alt'
			onClick={checkForUpdatesNow}
		/>
	);

	const openRowImageTypes = useCallback(() => {
		pushView({view: 'rowImageTypes', returnFocusTo: 'setting-rowImageTypes'});
	}, [pushView]);

	// Cycles Default and the four image types for one home row.
	const cycleRowImageType = useCallback((rowId) => {
		const overrides = settings.homeRowImageTypes || {};
		const order = [undefined, ...getImageTypeOptions().map((option) => option.value)];
		const next = order[(order.indexOf(overrides[rowId]) + 1) % order.length];
		const updated = {...overrides};
		if (next === undefined) delete updated[rowId];
		else updated[rowId] = next;
		updateSetting('homeRowImageTypes', updated);
	}, [settings.homeRowImageTypes, updateSetting]);

	// Read on every open, so a rating the server picked up since shows without a restart. Only the
	// latest open gets to answer.
	const openParentalControls = useCallback(() => {
		pushView({view: 'blockedRatings', returnFocusTo: 'setting-parentalControls'});
		const request = ++ratingsRequestRef.current;
		setAvailableRatings(null);
		setRatingsLoadFailed(false);
		readServerRatings(api)
			.then((ratings) => {
				if (request === ratingsRequestRef.current) setAvailableRatings(ratings);
			})
			.catch(() => {
				if (request !== ratingsRequestRef.current) return;
				setRatingsLoadFailed(true);
				setAvailableRatings([]);
			});
	}, [pushView, api]);

	// The screen opens on a spinner with nothing to focus, so the first rating takes focus once the
	// list is in.
	const onBlockedRatings = currentView.view === 'blockedRatings';
	const ratingsLoaded = availableRatings !== null;
	useEffect(() => {
		if (onBlockedRatings && ratingsLoaded) Spotlight.focus('blocked-ratings-view');
	}, [onBlockedRatings, ratingsLoaded]);

	// Read from the store rather than the render, so two quick presses can't drop each other's
	// change.
	const toggleBlockedRating = useCallback((rating) => {
		const current = getBlockedRatings();
		setBlockedRatings(current.includes(rating)
			? current.filter((value) => value !== rating)
			: [...current, rating]);
	}, []);

	const openSubtitleDownloadLanguages = useCallback(() => {
		pushView({view: 'subtitleDownloadLanguages', returnFocusTo: 'setting-subtitleDownloadLanguages'});
	}, [pushView]);

	const toggleSubtitleDownloadLanguage = useCallback((language) => {
		const picked = settings.subtitleDownloadLanguages || [];
		if (picked.includes(language)) {
			updateSetting('subtitleDownloadLanguages', picked.filter((value) => value !== language));
		} else if (picked.length < MAX_SUBTITLE_DOWNLOAD_LANGUAGES) {
			updateSetting('subtitleDownloadLanguages', [...picked, language]);
		}
	}, [settings.subtitleDownloadLanguages, updateSetting]);

	// Only the codecs this device's transcode can turn into something else are offered, and
	// the list is settled before the screen opens since it orders its rows once.
	const [transcodeAudioOptions, setTranscodeAudioOptions] = useState([]);
	const openTranscodeAudioCodecs = useCallback(async () => {
		const profile = await getDeviceProfile(serverType, {}, api).catch(() => null);
		setTranscodeAudioOptions(getTranscodeAudioCodecOptions().filter(({value}) => !profile || canTranscodeAudioCodecAway(profile, value)));
		pushView({view: 'transcodeAudioCodecs', returnFocusTo: 'setting-transcodeAudioCodecs'});
	}, [serverType, api, pushView]);

	const toggleTranscodeAudioCodec = useCallback((codec) => {
		const picked = settings.transcodeAudioCodecs || [];
		updateSetting('transcodeAudioCodecs', picked.includes(codec)
			? picked.filter((value) => value !== codec)
			: [...picked, codec]);
	}, [settings.transcodeAudioCodecs, updateSetting]);

	const openRatingSources = useCallback(() => {
		const sources = Array.isArray(settings.mdblistRatingSources) ? [...settings.mdblistRatingSources] : [];
		openedRatingSourcesRef.current = sources.join(',');
		setTempRatingSources(sources);
		pushView({view: 'ratingSources', returnFocusTo: 'setting-ratingSources'});
	}, [settings.mdblistRatingSources, pushView]);

	const toggleRatingSource = useCallback((sourceValue) => {
		setTempRatingSources((prev) => {
			if (prev.includes(sourceValue)) {
				return prev.filter((value) => value !== sourceValue);
			}
			return [...prev, sourceValue];
		});
	}, []);

	// The stored list is ordered, and the ratings row draws sources in that order.
	const moveRatingSource = useCallback((sourceValue, delta) => {
		setTempRatingSources((prev) => {
			const from = prev.indexOf(sourceValue);
			const to = from + delta;
			if (from < 0 || to < 0 || to >= prev.length) return prev;
			const next = [...prev];
			next.splice(from, 1);
			next.splice(to, 0, sourceValue);
			return next;
		});
	}, []);

	const resetRatingSources = useCallback(() => {
		setTempRatingSources([...defaultSettings.mdblistRatingSources]);
	}, []);

	// Covers every ratings setting, not just the source list, so one action puts the
	// whole integration back the way it shipped. Asks for a second press the same way
	// the profile reset does.
	const resetRatingsSettings = useCallback(() => {
		if (!ratingsResetArmed) {
			setRatingsResetArmed(true);
			return;
		}
		setRatingsResetArmed(false);
		updateSettings({
			mdblistEnabled: defaultSettings.mdblistEnabled,
			mdblistRatingSources: [...defaultSettings.mdblistRatingSources],
			tmdbEpisodeRatingsEnabled: defaultSettings.tmdbEpisodeRatingsEnabled,
			showRatingLabels: defaultSettings.showRatingLabels,
			showRatingBadges: defaultSettings.showRatingBadges
		});
	}, [ratingsResetArmed, updateSettings]);

	// An armed reset left behind shouldnt fire from a later visit
	useEffect(() => {
		setRatingsResetArmed(false);
	}, [currentView]);

	// Written back once the screen closes, and only if the list ended up different
	const commitRatingSources = useCallback(() => {
		if (tempRatingSources.join(',') === openedRatingSourcesRef.current) return;
		openedRatingSourcesRef.current = tempRatingSources.join(',');
		updateSetting('mdblistRatingSources', tempRatingSources);
	}, [tempRatingSources, updateSetting]);

	const openExcludedGenres = useCallback(() => {
		const excluded = Array.isArray(settings.excludedGenres) ? settings.excludedGenres : [];
		setTempExcludedGenresText(excluded.join(', '));
		pushView({view: 'excludedGenres', returnFocusTo: 'setting-excludedGenres'});
	}, [settings.excludedGenres, pushView]);

	const saveExcludedGenres = useCallback(() => {
		const parsed = tempExcludedGenresText
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		const normalized = [...new Set(parsed.map((value) => value.toLowerCase()))];
		updateSetting('excludedGenres', normalized);
		popView();
	}, [tempExcludedGenresText, updateSetting, popView]);

	const {userId, record: signInPin, account: pinAccount, latest: latestSignInPin, save: saveSignInPin} = useSignInPin();

	const openPinFlow = useCallback((purpose, returnFocusTo) => {
		setTempPinCode('');
		setPinCodeError('');
		setPinFlow({purpose, verify: purpose !== 'enable'});
		pushView({view: 'pinCode', returnFocusTo});
	}, [pushView]);

	// Turning the PIN off, changing it and removing it all take the current one first.
	const toggleSignInPin = useCallback(() => {
		openPinFlow(isSignInPinEnabled(signInPin) ? 'disable' : 'enable', 'setting-pinCodeProtection');
	}, [openPinFlow, signInPin]);
	const changeSignInPin = useCallback(() => openPinFlow('change', 'setting-pinCode'), [openPinFlow]);
	const removeSignInPin = useCallback(() => openPinFlow('remove', 'setting-removePin'), [openPinFlow]);

	// The PIN may have been set or removed on another device since.
	const showingPinScreen = currentView.view === 'subcategory' && currentView.subcategoryId === 'pinCode';
	useEffect(() => {
		if (!showingPinScreen || !userId) return undefined;
		let cancelled = false;
		const before = latestSignInPin();
		refreshSignInPin(before, pinAccount).then((next) => {
			if (!cancelled && next !== before) saveSignInPin(next);
		});
		return () => { cancelled = true; };
	}, [showingPinScreen, userId, pinAccount, latestSignInPin, saveSignInPin]);

	const failPinStep = useCallback((message) => {
		setTempPinCode('');
		setPinCodeError(message);
	}, []);

	const submitPinCode = useCallback(async () => {
		if (pinBusy || !pinFlow) return;
		const entered = tempPinCode;
		if (!isPinShaped(entered)) {
			setPinCodeError($L('PIN must be exactly 4 digits.'));
			return;
		}
		const record = latestSignInPin();
		setPinBusy(true);
		try {
			if (!pinFlow.verify) {
				const stored = await storeSignInPin(record, entered, pinAccount, pinFlow.current);
				if (stored.refused) {
					failPinStep(stored.refused);
					return;
				}
				saveSignInPin(stored.record);
				popView();
				return;
			}

			const checked = await verifySignInPin(record, entered, pinAccount);
			if (checked.record !== record) saveSignInPin(checked.record);
			if (checked.outcome !== PIN_ACCEPTED) {
				failPinStep(signInPinMessage(checked));
				return;
			}
			if (pinFlow.purpose === 'change') {
				// The server wants the current PIN again to replace it.
				setPinFlow({purpose: 'change', verify: false, current: entered});
				setTempPinCode('');
				setPinCodeError('');
				return;
			}
			// A PIN the server holds has no off switch, only removal.
			if (pinFlow.purpose === 'disable' && !checked.record.server) {
				saveSignInPin({...checked.record, enabled: false});
				popView();
				return;
			}
			const dropped = await dropSignInPin(checked.record, pinAccount, entered);
			if (dropped.refused) {
				failPinStep(dropped.refused);
				return;
			}
			saveSignInPin(dropped.record);
			popView();
		} finally {
			setPinBusy(false);
		}
	}, [pinBusy, pinFlow, tempPinCode, pinAccount, latestSignInPin, saveSignInPin, failPinStep, popView]);

	const openKidsMode = useCallback(() => {
		setTempKidsPin('');
		setKidsPinError('');
		pushView({view: 'kidsModeSet', returnFocusTo: 'setting-kidsMode'});
	}, [pushView]);

	const saveKidsModePin = useCallback(() => {
		if (!/^\d{4}$/.test(tempKidsPin)) {
			setKidsPinError($L('PIN must be exactly 4 digits.'));
			return;
		}
		updateSettings({
			kidsPinHash: hashPin(tempKidsPin),
			kidsModeEnabled: true,
			...clearedLockout(KIDS_PIN)
		});
		setTempKidsPin('');
		setKidsPinError('');
		// Settings are sitting on a screen the mode has just taken away, so drop back to the root,
		// where the only entry left is the way out.
		setNavStack([{view: 'categories'}]);
	}, [tempKidsPin, updateSettings]);

	const exitKidsMode = useCallback(() => {
		const waiting = kidsModeNeedsPin(settings) ? lockoutRemaining(settings, KIDS_PIN) : 0;
		if (waiting > 0) {
			setTempKidsPin('');
			setKidsPinError(tooManyAttempts(waiting));
			return;
		}

		if (kidsModeNeedsPin(settings) && !pinMatches(tempKidsPin, {hash: settings.kidsPinHash})) {
			const {wait, changes} = registerFailedAttempt(settings, KIDS_PIN);
			updateSettings(changes);
			setTempKidsPin('');
			setKidsPinError(wait > 0 ? tooManyAttempts(wait) : $L('Incorrect PIN'));
			return;
		}

		// The PIN belonged to this stretch of the mode. Clearing it means the next time Kids Mode
		// goes on, someone picks a code for it rather than a forgotten one still being the way out.
		updateSettings({
			kidsModeEnabled: false,
			kidsPinHash: '',
			...clearedLockout(KIDS_PIN)
		});
		setTempKidsPin('');
		setKidsPinError('');
		setNavStack([{view: 'categories'}]);
	}, [tempKidsPin, settings, updateSettings]);

	const openSeerrHomeRows = useCallback(() => {
		pushView({view: 'seerrHomeRows', returnFocusTo: 'setting-seerrHomeRows'});
	}, [pushView]);

	const openImdbLists = useCallback(() => {
		pushView({ view: 'imdbLists', returnFocusTo: 'setting-imdbLists' });
	}, [pushView]);

	const openSeasonalRow = useCallback(() => {
		pushView({view: 'seasonalRow', returnFocusTo: 'setting-seasonalRow'});
	}, [pushView]);

	const openExternalTmdbLists = useCallback(() => {
		pushView({view: 'externalTmdbLists', returnFocusTo: 'setting-externalTmdbLists'});
	}, [pushView]);

	const openExternalCalendars = useCallback(() => {
		pushView({view: 'externalCalendars', returnFocusTo: 'setting-externalCalendars'});
	}, [pushView]);

	const openExternalCustomRows = useCallback(() => {
		pushView({view: 'externalCustomRows', returnFocusTo: 'setting-externalCustomRows'});
	}, [pushView]);

	// Lets a row on one screen open a screen that lives elsewhere in the schema, the
	// way Progress Bar Time is reached from Video Playback Preferences.
	const openScreen = useCallback((categoryId, subcategoryId, returnFocusTo) => {
		const sub = SCHEMA_BY_KEY[`${categoryId}.${subcategoryId}`];
		if (!sub) return;
		pushView({
			view: 'subcategory',
			categoryId,
			subcategoryId,
			label: resolve(sub.label, {seerrLabel}),
			returnFocusTo
		});
	}, [pushView, seerrLabel]);

	const {
		moonfinStatus, moonfinConnecting, seerrAuthType, seerrUsername, onSeerrUsernameChange,
		seerrPassword, onSeerrPasswordChange, seerrAuthSubmitting, seerrAuthMessage, seerrAuthError,
		handleMoonfinToggle, handleSeerrAuthTypeChange, handleSeerrLogin,
		handleSeerrPasswordKeyDown, handleSeerrLogout
	} = useSeerrAccount({seerr, seerrLabel, settings, updateSetting, serverUrl, accessToken});

	const {
		activeProfile, profileSyncBusy, profileSyncMessage, pickProfile, loadProfile, saveProfile, resetProfile
	} = useProfileSync({
		settings, selectSyncProfile, applyServerProfile, restoreSyncedDefaults,
		serverUrl, accessToken, user, currentView
	});

	// The achievement screens push by name so BACK walks back through them one at a time.
	const openAchievementsView = useCallback((view, returnFocusTo, badgeId) => {
		pushView({view, returnFocusTo, badgeId});
	}, [pushView]);

	// The friends and chat screens do the same, carrying which person or chat they are about.
	const openFriendsView = useCallback((view, returnFocusTo, params) => {
		pushView({view, returnFocusTo, params});
	}, [pushView]);

	const {
		themeStoreCatalog, themeStoreLoading, themeStoreError, themeStoreBusyId,
		openThemes, openThemeStore, handleStoreThemeClick
	} = useThemeStore({
		currentViewName: currentView.view,
		pushView,
		availableThemes,
		selectThemeById,
		saveStoreTheme,
		deleteStoreTheme
	});

	const {
		tempHomeRows, loading: homeRowsLoading, serverHasLiveTv,
		toggleHomeRowEnabled, toggleSeerrHomeRow, toggleSeerrSlider, openHomeRows, commitHomeRows, resetHomeRows,
		toggleHomeRow, moveHomeRow
	} = useHomeRowsEditor({api, serverUrl, servers, settings, updateSetting, updateSettings, pushView});

	const {
		tempButtons, buttonLayoutKind, openDetailButtons, openOsdButtons, openDetailMetadata,
		commitButtonLayout, resetButtonLayout, toggleLayoutButton, moveLayoutButton
	} = useButtonLayoutEditor({settings, updateSettings, pushView});

	const {
		allLibraries, hiddenLibraries, libraryLoading, librarySaving,
		openLibraries, toggleLibraryVisibility, saveLibraryVisibility
	} = useLibraryVisibility({api, settings, hasMultipleServers, pushView, popView, onLibrariesChanged});

	const openLibraryOrder = useCallback(() => {
		pushView({view: 'libraryOrder', returnFocusTo: 'setting-libraryOrder'});
	}, [pushView]);

	const openDetailSections = useCallback(() => {
		pushView({view: 'detailSections', returnFocusTo: 'setting-detailSections'});
	}, [pushView]);

	const hiddenDetailSections = settings[DETAIL_SECTIONS_HIDDEN_KEY];
	const toggleDetailSection = useCallback((id) => {
		updateSetting(DETAIL_SECTIONS_HIDDEN_KEY, toggleHiddenSection(hiddenDetailSections, id));
	}, [hiddenDetailSections, updateSetting]);

	const {
		mediaBarLibraries, mediaBarCollections, tempMediaBarLibraryIds, tempMediaBarCollectionIds, tempMediaBarExternalLists,
		mediaBarSourcesLoading, openMediaBarLibraries, openMediaBarCollections, openMediaBarExternalLists,
		toggleMediaBarLibrary, toggleMediaBarCollection, toggleMediaBarExternalList,
		saveMediaBarLibraries, saveMediaBarCollections, saveMediaBarExternalLists
	} = useMediaBarSources({api, settings, updateSettings, pushView, popView});

	const {
		screensaverLibraries, screensaverCollections, screensaverGenres,
		tempScreensaverLibraryIds, tempScreensaverCollectionIds, tempScreensaverGenres,
		screensaverSourcesLoading, openScreensaverLibraries, openScreensaverCollections, openScreensaverGenres,
		toggleScreensaverLibrary, toggleScreensaverCollection, toggleScreensaverGenre,
		saveScreensaverLibraries, saveScreensaverCollections, saveScreensaverGenres
	} = useScreensaverSources({api, settings, updateSettings, pushView, popView});

	const {
		logEntries, logFilter, setLogFilter, logRenderLimit, setLogRenderLimit,
		logMessage, sendingReport, sendUnavailableReason, openDiagnostics, handleClearLogs, handleSendReport
	} = useDiagnosticsLog({currentViewName: currentView.view, pushView, serverType, pluginInfo: seerr.pluginInfo});



	// The line the player would draw with the subtitle settings as they stand
	const renderSubtitlePreview = () => (
		<div className={css.subtitlePreview}>
			<span
				className={css.subtitlePreviewText}
				style={{...getSubtitleTextStyle(settings), opacity: getSubtitleOverlayStyle(settings).opacity}}
			>
				{$L('The quick brown fox jumps over the lazy dog')}
			</span>
		</div>
	);

	// Renders the six slots against a sample time so the layout can be judged without
	// starting playback to find out.
	const renderPlaybackTimePreview = () => {
		const previewArgs = {
			position: (42 * 60) + 10,
			duration: (1 * 3600) + (58 * 60) + 33,
			clockDisplay: settings.clockDisplay,
			timeOffsetHours: settings.timeOffsetHours
		};
		const cell = (settingKey, align) => (
			<span className={`${css.playbackTimeCell} ${css[align]}`}>
				{formatPlaybackTimeSlot({slot: settings[settingKey], ...previewArgs})}
			</span>
		);
		const row = (keys, rowClass) => (
			<div className={`${css.playbackTimeRow} ${rowClass}`}>
				{cell(keys[0], 'playbackTimeLeft')}
				{cell(keys[1], 'playbackTimeCenter')}
				{cell(keys[2], 'playbackTimeRight')}
			</div>
		);
		return (
			<div className={css.playbackTimePreview}>
				{row(['playbackTimeAboveLeft', 'playbackTimeAboveCenter', 'playbackTimeAboveRight'], css.playbackTimeAbove)}
				<div className={css.playbackTimeBar}>
					<div className={css.playbackTimeBarFill} style={{width: `${((previewArgs.position / previewArgs.duration) * 100).toFixed(1)}%`}} />
				</div>
				{row(['playbackTimeBelowLeft', 'playbackTimeBelowCenter', 'playbackTimeBelowRight'], css.playbackTimeBelow)}
			</div>
		);
	};

	const renderScreensaverPreview = () => (
		<ScreensaverPreview
			backdrop={settings.screensaverBackdrop}
			component={settings.screensaverComponent}
			movement={settings.screensaverMovement}
			position={settings.screensaverPosition}
			size={settings.screensaverSize}
			dimmingLevel={settings.screensaverDimmingLevel}
			clockDisplay={settings.clockDisplay}
			timeOffsetHours={settings.timeOffsetHours}
		/>
	);

	const closeClearDataDialog = useCallback(() => setClearDataDialogOpen(false), []);
	const openClearDataDialog = useCallback(() => setClearDataDialogOpen(true), []);

	const renderAboutDataActions = () => (
		<NavRow
			spotlightId='clear-all-data'
			title={$L('Clear All Data')}
			icon='delete_forever'
			onClick={openClearDataDialog}
		/>
	);

	const handleClearImageCache = useCallback(() => {
		clearImageCache();
		clearProxiedImageCache();
		setImageCacheCleared(true);
	}, []);

	const renderImageCacheActions = () => (
		<NavRow
			spotlightId='clear-image-cache'
			title={$L('Clear Image Cache')}
			desc={imageCacheCleared ? $L('Image cache cleared') : null}
			icon='cleaning_services_outlined'
			onClick={handleClearImageCache}
		/>
	);

	const renderAboutHeader = () => (
		<div className={css.aboutHeader}>
			<div className={css.aboutLogo} role='img' aria-label='Moonfin' />
			<div className={css.aboutVersion}>{$L('Version {version}').replace('{version}', process.env.REACT_APP_VERSION || '0.0.0')}</div>
			<div className={css.aboutDivider} />
		</div>
	);




	const refreshAllCustomRows = useCallback(async () => {
		const enabledRows = (settings.customHomeRows || []).filter((row) => row.enabled);
		if (enabledRows.length === 0 || customRowsRefreshing) return;
		setCustomRowsRefreshing(true);
		setCustomRowsRefreshMessage('');
		let refreshed = 0;
		await Promise.all(enabledRows.map(async (row) => {
			try {
				// forceRefresh also asks the plugin to rebuild its own cache.
				await fetchCustomRow(row, {forceRefresh: true, language: settings.uiLanguage});
				refreshed += 1;
			} catch (e) {
				void e;
			}
		}));
		setCustomRowsRefreshing(false);
		setCustomRowsRefreshMessage(
			$L('{done} of {total} lists refreshed')
				.replace('{done}', String(refreshed))
				.replace('{total}', String(enabledRows.length))
		);
	}, [settings.customHomeRows, settings.uiLanguage, customRowsRefreshing]);

	const resetCustomRowForm = useCallback(() => {
		setCustomRowUrl('');
		setCustomRowName('');
		setCustomRowParamA('');
		setCustomRowParamB('');
		setCustomRowSortBy('none');
		setCustomRowSortOrder('desc');
		setCustomRowShowUserRatings(true);
		setEditingCustomRowId(null);
		setCustomRowError('');
	}, []);

	const addCustomRow = useCallback(async () => {
		setCustomRowError('');
		const detected = customRowMode === 'url'
			? detectCustomSource(customRowUrl)
			: buildManualCustomSource(customRowSourceKey, customRowParamA, customRowParamB);
		if (detected.error) {
			setCustomRowError(detected.error);
			return;
		}
		const existing = editingCustomRowId
			? (settings.customHomeRows || []).find((r) => r.id === editingCustomRowId)
			: null;
		const row = {
			id: editingCustomRowId || `custom_${Date.now()}`,
			name: customRowName.trim() || detected.params.id || detected.params.listname || detected.params.user || $L('Custom List'),
			source: detected.source,
			type: detected.type,
			params: detected.params,
			enabled: existing ? existing.enabled : true,
			sortBy: customRowSortBy,
			sortOrder: customRowSortOrder
		};
		if (detected.source === 'letterboxd') row.showUserRatings = customRowShowUserRatings;
		setCustomRowSaving(true);
		const result = await validateCustomRow(row, {language: settings.uiLanguage});
		setCustomRowSaving(false);
		if (result.error) {
			setCustomRowError(result.error);
			return;
		}
		const rows = settings.customHomeRows || [];
		updateSetting('customHomeRows', existing
			? rows.map((r) => (r.id === row.id ? row : r))
			: [...rows, row]);
		resetCustomRowForm();
	}, [customRowMode, customRowUrl, customRowSourceKey, customRowParamA, customRowParamB,
		customRowName, customRowSortBy, customRowSortOrder, customRowShowUserRatings,
		editingCustomRowId, settings.customHomeRows, settings.uiLanguage, updateSetting, resetCustomRowForm]);

	// Loads a stored row into the manual form so its ids and sorting can change
	// without removing and re-adding it.
	const editCustomRow = useCallback((id) => {
		const row = (settings.customHomeRows || []).find((r) => r.id === id);
		if (!row) return;
		setCustomRowMode('manual');
		setCustomRowSourceKey(sourceKeyForRow(row));
		const params = row.params || {};
		setCustomRowParamA(params.id || params.username || params.user || '');
		setCustomRowParamB(params.listname || '');
		setCustomRowName(row.name || '');
		setCustomRowSortBy(row.sortBy || 'none');
		setCustomRowSortOrder(row.sortOrder || 'desc');
		setCustomRowShowUserRatings(row.showUserRatings !== false);
		setEditingCustomRowId(id);
		setCustomRowError('');
	}, [settings.customHomeRows]);

	// The title sort reads naturally A to Z, everything else biggest first.
	const changeCustomRowSortBy = useCallback((value) => {
		setCustomRowSortBy(value);
		setCustomRowSortOrder(value === 'title' ? 'asc' : 'desc');
	}, []);

	const toggleCustomRowUserRatings = useCallback(() => {
		setCustomRowShowUserRatings((prev) => !prev);
	}, []);

	const deleteCustomRow = useCallback((id) => {
		updateSetting('customHomeRows', (settings.customHomeRows || []).filter((r) => r.id !== id));
	}, [settings.customHomeRows, updateSetting]);

	const toggleCustomRow = useCallback((id) => {
		updateSetting('customHomeRows', (settings.customHomeRows || []).map((r) => (r.id === id ? {...r, enabled: !r.enabled} : r)));
	}, [settings.customHomeRows, updateSetting]);



	const handleClearAllData = useCallback(async () => {
		setClearDataDialogOpen(false);
		resetSettings();
		await clearAllStorage();
		await logoutAll();
	}, [resetSettings, logoutAll]);

	const canProbeDevice = isXbox() && !!serverUrl && !!accessToken;

	const settingsCtx = useMemo(() => ({
		settings,
		capabilities,
		seerr,
		achievements,
		romm,
		seerrLabel,
		isSeerr,
		isWebOS: isWebOS(),
		isTizen: isTizen(),
		isVega: isVega(),
		isXbox: isXbox(),
		serverUrl,
		serverVersion,
		availableThemes,
		activeThemeId,
		ratingsResetArmed,
		signInPin,
		actions: {
			openThemes,
			openThemeStore,
			openHomeRows,
			openDetailButtons,
			openOsdButtons,
			openDetailMetadata,
			openDetailSections,
			openDiagnostics,
			toggleSignInPin,
			changeSignInPin,
			removeSignInPin,
			openKidsMode,
			openLibraries,
			openLibraryOrder,
			openParentalControls,
			openSubtitleDownloadLanguages,
			openTranscodeAudioCodecs,
			openQrLink,
			openRatingSources,
			openRowImageTypes,
			openExcludedGenres,
			openMediaBarLibraries,
			openMediaBarCollections,
			openMediaBarExternalLists,
			openScreensaverLibraries,
			openScreensaverCollections,
			openScreensaverGenres,
			openImdbLists,
			openSeasonalRow,
			openExternalTmdbLists,
			openExternalCalendars,
			openExternalCustomRows,
			openSeerrHomeRows,
			openScreen,
			resetRatingsSettings,
			toggleExperimentalTruehd,
			setSetting: updateSetting,
			setSettings: updateSettings,
			refreshPlugin,
			runSetupAgain: onRunSetupWizard,
			// The probe page ships with the Xbox build, and its report goes to the server
			// the user is signed in to, so it is only offered there and then.
			openDeviceProbe: canProbeDevice ? openDeviceProbe : null
		}
	}), [
		settings, capabilities, seerr, achievements, romm, seerrLabel, isSeerr, serverUrl, ratingsResetArmed, resetRatingsSettings, toggleExperimentalTruehd, updateSetting, updateSettings, refreshPlugin,
		serverVersion, availableThemes, activeThemeId, openThemes, openThemeStore, openHomeRows,
		openDetailButtons, openOsdButtons, openDetailMetadata, openDetailSections, openDiagnostics,
		signInPin, toggleSignInPin, changeSignInPin, removeSignInPin, openKidsMode, openLibraries, openLibraryOrder, openParentalControls, openSubtitleDownloadLanguages, openTranscodeAudioCodecs, openQrLink, openRatingSources, openRowImageTypes, openExcludedGenres, openMediaBarLibraries,
		openMediaBarCollections, openMediaBarExternalLists, openScreensaverLibraries, openScreensaverCollections, openScreensaverGenres,
		openImdbLists, openSeasonalRow, openExternalTmdbLists, openExternalCalendars,
		openExternalCustomRows, openSeerrHomeRows, openScreen, onRunSetupWizard, canProbeDevice
	]);

	const openCategory = useCallback((id) => {
		// A category holding a single screen opens it directly, unless it always lists its screens
		const category = SETTINGS_SCHEMA.find((c) => c.id === id);
		const visible = (category?.subcategories || [])
			.filter((sub) => sub.menu !== false && (!sub.when || sub.when(settingsCtx)));
		if (visible.length === 1 && !category.alwaysMenu) {
			// A subcategory that is really a screen of its own opens that screen, the same way it
			// would if it had been reached through the subcategory list.
			pushView(visible[0].opensView
				? {
					view: visible[0].opensView,
					label: resolve(visible[0].label, settingsCtx),
					returnFocusTo: `cat-${id}`
				}
				: {
					view: 'subcategory',
					categoryId: id,
					subcategoryId: visible[0].id,
					label: resolve(visible[0].label, settingsCtx),
					returnFocusTo: `cat-${id}`
				});
			return;
		}
		pushView({view: 'category', id, returnFocusTo: `cat-${id}`});
	}, [pushView, settingsCtx]);


	const openSubcategory = useCallback((sub) => {
		// An entry that is a screen in its own right rather than a list of settings rows opens
		// that screen, instead of a page holding nothing but a link to it.
		pushView(sub.opensView
			? {view: sub.opensView, label: sub.label, returnFocusTo: `subcat-${sub.id}`}
			: {
				view: 'subcategory',
				categoryId: currentView.id,
				subcategoryId: sub.id,
				label: sub.label,
				returnFocusTo: `subcat-${sub.id}`
			});
	}, [pushView, currentView.id]);

	const selectOptionValue = useCallback((value) => {
		if (currentView.onSelect) {
			currentView.onSelect(value);
			popView();
			return;
		}
		handleOptionSelect(currentView.settingKey, value);
	}, [handleOptionSelect, popView, currentView]);

	const showMoreLogs = useCallback(() => {
		setLogRenderLimit((prev) => prev + LOG_RENDER_STEP);
	}, [setLogRenderLimit]);

	const changeCustomRowUrl = useCallback((value) => {
		setCustomRowUrl(value);
		setCustomRowError('');
	}, []);

	const changePinCode = useCallback((value) => {
		setTempPinCode(value);
		setPinCodeError('');
	}, []);


	// Kept out of settingsCtx because the search index has no use for them and they are
	// rebuilt every render, which would defeat the memo above.
	const customRenderers = {
		moonbasePlugin: () => (
			<MoonbasePanel
				enabled={settings.useMoonfinPlugin}
				pluginInfo={seerr.pluginInfo}
				connecting={moonfinConnecting || seerr.isLoading}
				statusText={moonfinStatus}
				seerrLabel={seerrLabel}
				onToggle={handleMoonfinToggle}
				activeProfile={activeProfile}
				busy={profileSyncBusy}
				message={profileSyncMessage}
				onPickProfile={pickProfile}
				onLoad={loadProfile}
				onSave={saveProfile}
				onReset={resetProfile}
			/>
		),
		seerrPanel: () => (
			<SeerrAccountPanel
				pluginEnabled={settings.useMoonfinPlugin}
				seerr={seerr}
				seerrLabel={seerrLabel}
				authType={seerrAuthType}
				username={seerrUsername}
				password={seerrPassword}
				submitting={seerrAuthSubmitting}
				message={seerrAuthMessage}
				error={seerrAuthError}
				onAuthTypeChange={handleSeerrAuthTypeChange}
				onUsernameChange={onSeerrUsernameChange}
				onPasswordChange={onSeerrPasswordChange}
				onPasswordKeyDown={handleSeerrPasswordKeyDown}
				onLogin={handleSeerrLogin}
				onLogout={handleSeerrLogout}
			/>
		),
		rommPanel: () => <RommAccountPanel romm={romm} />,
		aboutHeader: renderAboutHeader,
		aboutDataActions: renderAboutDataActions,
		imageCacheActions: renderImageCacheActions,
		checkForUpdates: renderCheckForUpdates,
		playbackTimePreview: renderPlaybackTimePreview,
		subtitlePreview: renderSubtitlePreview,
		screensaverPreview: renderScreensaverPreview,
		loadingAnimationPreview: () => <LoadingAnimationPreview />,
		trickplayPreview: () => <TrickplaySettingsPreview />
	};

	const rowDeps = {settings, updateSetting, toggleSetting, pushView, customRenderers};

	// Only the debounced query drives the swap, so the categories do not blink out
	// between the second keystroke and the debounce landing.
	// Kids Mode leaves one entry standing, and a search box would list the rest straight back.
	const showSearchResults = currentView.view === 'categories' &&
		!settings.kidsModeEnabled &&
		debouncedQuery.trim().length >= MIN_QUERY_LENGTH;

	const searchResults = useMemo(() => {
		if (!showSearchResults) return [];
		const index = buildSettingsIndex(SETTINGS_SCHEMA, settingsCtx, {resolve, spotlightIdOf});
		return matchSettings(index, debouncedQuery);
	}, [showSearchResults, debouncedQuery, settingsCtx]);

	searchResultsRef.current = searchResults;
	searchQueryRef.current = searchQuery;

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(searchQuery), 200);
		return () => clearTimeout(timer);
	}, [searchQuery]);

	const handleSearchChange = useCallback((e) => {
		setSearchQuery(e.target.value);
	}, []);

	const handleSearchKeyDown = useCallback((e) => {
		// SpottableInput only forwards keys while the field is not being typed into, so
		// this is the not-typing case and Down should enter the results. Spotlight's own key
		// handler ignores preventDefault, so the event is stopped or it moves on to the second result.
		if (e.keyCode === 40 && searchResultsRef.current.length > 0) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus(resultSpotlightId(searchResultsRef.current[0]));
		}
	}, []);

	const handleResultKeyDown = useCallback((e) => {
		if (e.keyCode !== 38) return;
		if (parseInt(e.currentTarget.dataset.resultIndex, 10) !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		Spotlight.focus('settings-search-input');
	}, []);


	const getSubcategories = (catId) => {
		const category = SETTINGS_SCHEMA.find((c) => c.id === catId);
		if (!category) return [];
		return category.subcategories
			.filter((sub) => sub.menu !== false && (!sub.when || sub.when(settingsCtx)))
			.map((sub) => ({
				id: sub.id,
				label: resolve(sub.label, settingsCtx),
				description: resolve(sub.description, settingsCtx),
				section: resolve(sub.section, settingsCtx),
				icon: sub.icon,
				opensView: sub.opensView
			}));
	};

	const getSubcategoryContent = (categoryId, subcategoryId) => {
		const screen = SCHEMA_BY_KEY[`${categoryId}.${subcategoryId}`];
		if (!screen) return null;
		return screen.rows.map((row, index) => renderDescriptorRow(row, settingsCtx, index, rowDeps));
	};

	const openSearchResult = useCallback((entry) => {
		// The focus effect consumes this before it falls back to a per-view default, which
		// is what lands the highlight on the exact row rather than the top of the screen.
		if (entry.spotlightId) pendingFocusRef.current = entry.spotlightId;
		pushView({
			view: 'subcategory',
			categoryId: entry.categoryId,
			subcategoryId: entry.subcategoryId,
			label: entry.subcategoryLabel,
			returnFocusTo: resultSpotlightId(entry)
		});
	}, [pushView]);
















	const homeRowEnabledMap = new Map((settings.homeRows || []).map((r) => [r.id, r.enabled]));

	// A picker is drawn over the screen it was opened from, which stays mounted under it
	const optionsOpen = currentView.view === 'options';
	const baseDepth = optionsOpen ? navStack.length - 2 : navStack.length - 1;
	const baseView = navStack[baseDepth];
	const viewName = baseView.view;
	// Each screen on the stack is its own mount, so one screen opened from another starts fresh
	const viewKey = `${baseDepth}:${viewName}:${baseView.id || ''}:${baseView.categoryId || ''}.${baseView.subcategoryId || ''}`;

	return (
		<div ref={pageRef} className={`${css.page}${panelMode ? ` ${css.pagePanel}` : ` ${css.pageAlone}`}`}>
			<SettingsTitleContext.Provider value={baseView.label || null}>
			<SettingsEnterContext.Provider value={navActionRef.current === 'push'}>
			<Fragment key={viewKey}>
			{viewName === 'categories' && (
				<CategoriesView
					categories={categories}
					searchQuery={searchQuery}
					onSearchChange={handleSearchChange}
					onSearchKeyDown={handleSearchKeyDown}
					showSearchResults={showSearchResults}
					hideSearch={settings.kidsModeEnabled}
					searchResults={searchResults}
					onOpenResult={openSearchResult}
					onResultKeyDown={handleResultKeyDown}
					onOpenCategory={openCategory}
				/>
			)}
			{viewName === 'category' && (
				<CategoryView
					title={categories.find((c) => c.id === baseView.id)?.label || $L('Settings')}
					subcategories={getSubcategories(baseView.id)}
					onOpenSubcategory={openSubcategory}
					clean={!!SETTINGS_SCHEMA.find((c) => c.id === baseView.id)?.clean}
				/>
			)}
			{viewName === 'subcategory' && (
				<SubcategoryView
					title={baseView.label || $L('Settings')}
					clean={!!SCHEMA_BY_KEY[`${baseView.categoryId}.${baseView.subcategoryId}`]?.clean}
					action={SCHEMA_BY_KEY[`${baseView.categoryId}.${baseView.subcategoryId}`]?.appBarAction}
					ctx={settingsCtx}
				>
					{getSubcategoryContent(baseView.categoryId, baseView.subcategoryId)}
				</SubcategoryView>
			)}
			{FRIENDS_VIEWS.indexOf(viewName) >= 0 && (
				<FriendsScreens
					view={viewName}
					params={baseView.params}
					onOpen={openFriendsView}
					onBack={popView}
					onSelectItem={onSelectItem}
				/>
			)}
			{ACHIEVEMENT_VIEWS.indexOf(viewName) >= 0 && (
				<AchievementsScreens
					view={viewName}
					badgeId={baseView.badgeId}
					onOpen={openAchievementsView}
					onSelectItem={onSelectItem}
				/>
			)}
			{viewName === 'themes' && (
				<ThemesView
					availableThemes={availableThemes}
					activeThemeId={activeThemeId}
					onSelectTheme={selectThemeById}
				/>
			)}
			{viewName === 'themeStore' && (
				<ThemeStoreView
					catalog={themeStoreCatalog}
					loading={themeStoreLoading}
					error={themeStoreError}
					busyId={themeStoreBusyId}
					availableThemes={availableThemes}
					onStoreThemeClick={handleStoreThemeClick}
				/>
			)}
			{viewName === 'homeRows' && (
				<HomeRowsView
					settings={settings}
					serverUrl={serverUrl}
					servers={servers}
					tempHomeRows={tempHomeRows}
					loading={homeRowsLoading}
					serverHasLiveTv={serverHasLiveTv}
					onToggleHomeRow={toggleHomeRow}
					onMoveHomeRow={moveHomeRow}
					onReset={resetHomeRows}
					onLeave={commitHomeRows}
				/>
			)}
			{viewName === 'buttonLayout' && (
				<ButtonLayoutView
					kind={buttonLayoutKind}
					tempButtons={tempButtons}
					onToggleButton={toggleLayoutButton}
					onMoveButton={moveLayoutButton}
					onReset={resetButtonLayout}
					onLeave={commitButtonLayout}
				/>
			)}
			{viewName === 'diagnostics' && (
				<DiagnosticsView
					loggingEnabled={settings.diagnosticLoggingEnabled}
					logEntries={logEntries}
					logFilter={logFilter}
					onFilterChange={setLogFilter}
					logRenderLimit={logRenderLimit}
					onShowMore={showMoreLogs}
					logMessage={logMessage}
					sendingReport={sendingReport}
					sendUnavailableReason={sendUnavailableReason}
					onClearLogs={handleClearLogs}
					onSendReport={handleSendReport}
				/>
			)}
			{viewName === 'seerrHomeRows' && (
				<SeerrHomeRowsView
					seerrLabel={seerrLabel}
					enabledMap={homeRowEnabledMap}
					onToggleRow={toggleSeerrHomeRow}
					homeRows={settings.homeRows}
					serverUrl={serverUrl}
					onToggleSlider={toggleSeerrSlider}
				/>
			)}
			{viewName === 'imdbLists' && (
				<ImdbListsView settings={settings} onUpdateSettings={updateSettings} />
			)}
			{viewName === 'seasonalRow' && (
				<SeasonalRowView settings={settings} onUpdateSettings={updateSettings} />
			)}
			{viewName === 'externalTmdbLists' && (
				<ExternalTmdbListsView enabledMap={homeRowEnabledMap} onToggleRow={toggleHomeRowEnabled} />
			)}
			{viewName === 'externalCalendars' && (
				<ExternalCalendarsView
					enabledMap={homeRowEnabledMap}
					settings={settings}
					onToggleRow={toggleHomeRowEnabled}
					onToggleSetting={toggleSetting}
				/>
			)}
			{viewName === 'externalCustomRows' && (
				<ExternalCustomRowsView
					rows={settings.customHomeRows || []}
					url={customRowUrl}
					name={customRowName}
					error={customRowError}
					saving={customRowSaving}
					refreshing={customRowsRefreshing}
					refreshMessage={customRowsRefreshMessage}
					mode={customRowMode}
					sourceKey={customRowSourceKey}
					paramA={customRowParamA}
					paramB={customRowParamB}
					sortBy={customRowSortBy}
					sortOrder={customRowSortOrder}
					showUserRatings={customRowShowUserRatings}
					editingId={editingCustomRowId}
					onRefreshAll={refreshAllCustomRows}
					onUrlChange={changeCustomRowUrl}
					onNameChange={setCustomRowName}
					onModeChange={setCustomRowMode}
					onSourceKeyChange={setCustomRowSourceKey}
					onParamAChange={setCustomRowParamA}
					onParamBChange={setCustomRowParamB}
					onSortByChange={changeCustomRowSortBy}
					onSortOrderChange={setCustomRowSortOrder}
					onToggleUserRatings={toggleCustomRowUserRatings}
					onToggleRow={toggleCustomRow}
					onDeleteRow={deleteCustomRow}
					onEditRow={editCustomRow}
					onCancelEdit={resetCustomRowForm}
					onAddRow={addCustomRow}
				/>
			)}
			{viewName === 'ratingSources' && (
				<RatingSourcesView
					selected={tempRatingSources}
					onToggleSource={toggleRatingSource}
					onMoveSource={moveRatingSource}
					onReset={resetRatingSources}
					onLeave={commitRatingSources}
				/>
			)}
			{viewName === 'rowImageTypes' && (
				<RowImageTypesView
					rows={(settings.homeRows || []).filter((row) => row.enabled && row.id !== 'librarybuttons' && !isPickedRow(row) && !isSeerrSliderRow(row))}
					overrides={settings.homeRowImageTypes || {}}
					globalLabel={getLabel(getImageTypeOptions(), settings.homeRowsImageType, $L('Poster'))}
					onCycleRow={cycleRowImageType}
				/>
			)}
			{viewName === 'qrLink' && (
				<QrLinkView title={baseView.label} url={baseView.url} onClose={popView} />
			)}
			{viewName === 'subtitleDownloadLanguages' && (
				<CheckListView
					spotlightId='subtitle-download-languages-view'
					rowIdPrefix='subtitle-download-language'
					title={$L('Subtitle Download Languages')}
					lead={$L('Languages to search when downloading subtitles, up to {max}. With none ticked, one language is picked from the video.').replace('{max}', MAX_SUBTITLE_DOWNLOAD_LANGUAGES)}
					options={getSubtitleLanguageOptions().filter((option) => option.value)}
					picked={settings.subtitleDownloadLanguages || []}
					max={MAX_SUBTITLE_DOWNLOAD_LANGUAGES}
					onToggle={toggleSubtitleDownloadLanguage}
				/>
			)}
			{viewName === 'transcodeAudioCodecs' && (
				<CheckListView
					spotlightId='transcode-audio-codecs-view'
					rowIdPrefix='transcode-audio-codec'
					title={$L('Transcode Audio Codecs')}
					lead={$L('The server converts audio in these formats instead of sending it as is.')}
					options={transcodeAudioOptions}
					picked={settings.transcodeAudioCodecs || []}
					onToggle={toggleTranscodeAudioCodec}
				/>
			)}
			{viewName === 'blockedRatings' && (
				<BlockedRatingsView
					ratings={sortRatingsBySeverity([...new Set([...(availableRatings || []), ...blockedRatings])])}
					blocked={blockedRatings}
					loading={availableRatings === null}
					loadFailed={ratingsLoadFailed}
					onToggleRating={toggleBlockedRating}
				/>
			)}
			{viewName === 'excludedGenres' && (
				<ExcludedGenresView
					text={tempExcludedGenresText}
					onTextChange={setTempExcludedGenresText}
					onCancel={popView}
					onSave={saveExcludedGenres}
				/>
			)}
			{viewName === 'kidsModeSet' && (
				<KidsModeSetView
					pin={tempKidsPin}
					error={kidsPinError}
					onPinChange={setTempKidsPin}
					onCancel={popView}
					onSave={saveKidsModePin}
				/>
			)}
			{viewName === 'kidsModeExit' && (
				<KidsModeExitView
					pin={tempKidsPin}
					error={kidsPinError}
					onPinChange={setTempKidsPin}
					onCancel={popView}
					onSubmit={exitKidsMode}
				/>
			)}
			{viewName === 'pinCode' && (
				<PinCodeView
					pin={tempPinCode}
					error={pinCodeError}
					verify={Boolean(pinFlow?.verify)}
					onPinChange={changePinCode}
					onCancel={popView}
					onSave={submitPinCode}
				/>
			)}
			{viewName === 'libraries' && (
				<LibrariesView
					libraries={allLibraries}
					hiddenLibraries={hiddenLibraries}
					showServerName={settings.unifiedLibraryMode && hasMultipleServers}
					loading={libraryLoading}
					saving={librarySaving}
					onToggleLibrary={toggleLibraryVisibility}
					onCancel={popView}
					onSave={saveLibraryVisibility}
				/>
			)}
			{viewName === 'libraryOrder' && (
				<LibraryOrderView
					api={api}
					unified={settings.unifiedLibraryMode && hasMultipleServers}
					onLibrariesChanged={onLibrariesChanged}
				/>
			)}
			{viewName === 'detailSections' && (
				<DetailSectionsView
					style={settings.detailScreenStyle}
					seerrAvailable={seerr.isEnabled}
					seerrLabel={seerrLabel}
					hidden={hiddenDetailSections}
					onToggle={toggleDetailSection}
				/>
			)}
			{viewName === 'mediaBarLibraries' && (
				<MediaBarSourceView
					viewSpotlightId='media-bar-libraries-view'
					title={$L('Media Bar Source Libraries')}
					description={$L('Choose which libraries are used for featured media when source type is Libraries.')}
					loadingLabel={$L('Loading libraries...')}
					loading={mediaBarSourcesLoading}
					items={mediaBarLibraries}
					itemIdKey='Id'
					itemNameKey='Name'
					selectedIds={tempMediaBarLibraryIds}
					itemSpotlightPrefix='media-bar-lib'
					cancelSpotlightId='media-bar-lib-cancel'
					saveSpotlightId='media-bar-lib-save'
					onToggleSelection={toggleMediaBarLibrary}
					onCancel={popView}
					onSave={saveMediaBarLibraries}
				/>
			)}
			{viewName === 'mediaBarCollections' && (
				<MediaBarSourceView
					viewSpotlightId='media-bar-collections-view'
					title={$L('Media Bar Source Collections')}
					description={$L('Choose which collections are used for featured media when source type is Collections.')}
					loadingLabel={$L('Loading collections...')}
					loading={mediaBarSourcesLoading}
					items={mediaBarCollections}
					itemIdKey='Id'
					itemNameKey='Name'
					selectedIds={tempMediaBarCollectionIds}
					itemSpotlightPrefix='media-bar-collection'
					cancelSpotlightId='media-bar-collection-cancel'
					saveSpotlightId='media-bar-collection-save'
					onToggleSelection={toggleMediaBarCollection}
					onCancel={popView}
					onSave={saveMediaBarCollections}
				/>
			)}
			{viewName === 'mediaBarExternalLists' && (
				<MediaBarSourceView
					viewSpotlightId='media-bar-external-lists-view'
					title={$L('External Lists')}
					description={$L('Choose which IMDb, TMDB and custom lists the media bar also draws from.')}
					loading={false}
					items={mediaBarExternalListOptions(settings.customHomeRows, seerr.pluginInfo?.tmdbAvailable === true)}
					itemIdKey='Id'
					itemNameKey='Name'
					selectedIds={tempMediaBarExternalLists}
					itemSpotlightPrefix='media-bar-external-list'
					cancelSpotlightId='media-bar-external-list-cancel'
					saveSpotlightId='media-bar-external-list-save'
					onToggleSelection={toggleMediaBarExternalList}
					onCancel={popView}
					onSave={saveMediaBarExternalLists}
				/>
			)}
			{viewName === 'screensaverLibraries' && (
				<MediaBarSourceView
					viewSpotlightId='screensaver-libraries-view'
					title={$L('Source Libraries')}
					description={$L('Choose which libraries the screensaver picks artwork from.')}
					loadingLabel={$L('Loading libraries...')}
					loading={screensaverSourcesLoading}
					items={screensaverLibraries}
					itemIdKey='Id'
					itemNameKey='Name'
					selectedIds={tempScreensaverLibraryIds}
					itemSpotlightPrefix='screensaver-lib'
					cancelSpotlightId='screensaver-lib-cancel'
					saveSpotlightId='screensaver-lib-save'
					onToggleSelection={toggleScreensaverLibrary}
					onCancel={popView}
					onSave={saveScreensaverLibraries}
				/>
			)}
			{viewName === 'screensaverCollections' && (
				<MediaBarSourceView
					viewSpotlightId='screensaver-collections-view'
					title={$L('Source Collections')}
					description={$L('Choose which collections the screensaver picks artwork from.')}
					loadingLabel={$L('Loading collections...')}
					loading={screensaverSourcesLoading}
					items={screensaverCollections}
					itemIdKey='Id'
					itemNameKey='Name'
					selectedIds={tempScreensaverCollectionIds}
					itemSpotlightPrefix='screensaver-collection'
					cancelSpotlightId='screensaver-collection-cancel'
					saveSpotlightId='screensaver-collection-save'
					onToggleSelection={toggleScreensaverCollection}
					onCancel={popView}
					onSave={saveScreensaverCollections}
				/>
			)}
			{viewName === 'screensaverGenres' && (
				<MediaBarSourceView
					viewSpotlightId='screensaver-genres-view'
					title={$L('Excluded Genres')}
					description={$L('Artwork from the genres you pick here is left out of the screensaver.')}
					loadingLabel={$L('Loading genres...')}
					loading={screensaverSourcesLoading}
					items={screensaverGenres}
					itemIdKey='Id'
					itemNameKey='Name'
					selectedIds={tempScreensaverGenres}
					itemSpotlightPrefix='screensaver-genre'
					cancelSpotlightId='screensaver-genre-cancel'
					saveSpotlightId='screensaver-genre-save'
					onToggleSelection={toggleScreensaverGenre}
					onCancel={popView}
					onSave={saveScreensaverGenres}
				/>
			)}
			</Fragment>
			</SettingsEnterContext.Provider>
			</SettingsTitleContext.Provider>
			{optionsOpen && (
				<OptionsDialog
					title={currentView.title}
					options={currentView.options}
					currentValue={currentView.settingKey === '__themeSelection' ? activeThemeId : currentView.value}
					onSelect={selectOptionValue}
				/>
			)}
			<ClearDataDialog
				open={clearDataDialogOpen}
				onCancel={closeClearDataDialog}
				onConfirm={handleClearAllData}
			/>
		</div>
	);
};

export default Settings;
