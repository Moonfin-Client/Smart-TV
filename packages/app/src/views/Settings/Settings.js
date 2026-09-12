import {useCallback, useState, useEffect, useMemo, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import {useAuth} from '../../context/AuthContext';
import {useSettings, defaultSettings, profileToLocal, localToProfile, flushSettingsPush} from '../../context/SettingsContext';
import {getMoonfinResolvedProfile, deleteMoonfinProfile, saveMoonfinProfile} from '../../services/seerrApi';
import {homeRowsFromProfile} from '../../utils/homeLayout';
import {seedLanguagePreferences} from '../../utils/languagePrefSeed';
import {useSeerr} from '../../context/SeerrContext';
import {useDeviceInfo} from '../../hooks/useDeviceInfo';
import {isBackKey} from '../../utils/keys';
import {isTvKeyboardVisible} from '../../components/TVKeyboard/keyboardBus';
import {isWebOS} from '../../platform';
import ClearDataDialog from '../../components/ClearDataDialog';
import ScreensaverPreview from '../../components/Screensaver/ScreensaverPreview';
import {clearAllStorage} from '../../services/storage';
import {clearImageCache} from '../../services/imageProxy';
import {clearProxiedImageCache} from '../../hooks/useProxiedImage';
import {detectCustomSource, validateCustomRow, buildManualCustomSource, sourceKeyForRow} from '../../utils/externalHomeRows';
import {fetchCustomRow} from '../../services/externalRowsApi';
import {checkForUpdatesDetailed} from '../../services/versionChecker';
import QrLinkView from './QrLinkView';
import {formatPlaybackTimeSlot} from '../../utils/playbackTimeLabels';
import {getHomeRowsStyleOptions, getImageTypeOptions, getLabel} from './settingsOptions';
import {SCHEMA_BY_KEY, SETTINGS_SCHEMA, resolve, spotlightIdOf} from './settingsSchema';
import {MIN_QUERY_LENGTH, buildSettingsIndex, matchSettings} from './settingsSearch';
import {PLUGIN_SECTION_RENDER_STEP} from './homeSectionsModel';
import useSeerrAccount from './useSeerrAccount';
import useThemeStore from './useThemeStore';
import useHomeRowsEditor from './useHomeRowsEditor';
import useButtonLayoutEditor from './useButtonLayoutEditor';
import useLibraryVisibility from './useLibraryVisibility';
import useMediaBarSources from './useMediaBarSources';
import useScreensaverSources from './useScreensaverSources';
import useDiagnosticsLog from './useDiagnosticsLog';
import renderDescriptorRow from './settingsDescriptorRow';
import {CategoriesView, CategoryView, SubcategoryView, OptionsView} from './BrowseViews';
import {ThemesView, ThemeStoreView} from './ThemeViews';
import {SeerrHomeRowsView, ImdbListsView} from './HomeRowToggleViews';
import {ExternalTmdbListsView, ExternalCalendarsView, ExternalCustomRowsView} from './ExternalRowViews';
import {RatingSourcesView, ExcludedGenresView, PinCodeView, BlockedRatingsView, RowImageTypesView} from './PickerViews';
import HomeRowsView from './HomeRowsView';
import ButtonLayoutView from './ButtonLayoutView';
import DiagnosticsView from './DiagnosticsView';
import LibrariesView from './LibrariesView';
import MediaBarSourceView from './MediaBarSourceView';
import SeerrAccountPanel from './SeerrAccountPanel';
import {LOG_RENDER_STEP} from './useDiagnosticsLog';

import css from './Settings.module.less';

const SpottableButton = Spottable('button');

// The four settings profiles the Moonbase plugin stores, in server order.
const PROFILE_CHIPS = [
	{profile: 'global', label: () => $L('Global')},
	{profile: 'desktop', label: () => $L('Desktop')},
	{profile: 'mobile', label: () => $L('Mobile')},
	{profile: 'tv', label: () => $L('TV')}
];


const Settings = ({ onBack, onLibrariesChanged, onRunSetupWizard, panelMode }) => {
	const { api, serverUrl, accessToken, hasMultipleServers, logoutAll, activeServerInfo, user } = useAuth();
	const { settings, updateSetting, updateSettings, resetSettings, restoreSyncedDefaults, availableThemes, activeThemeId, selectThemeById, saveStoreTheme, deleteStoreTheme } = useSettings();
	const { capabilities } = useDeviceInfo();
	const seerr = useSeerr();
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
	// the settings context, which is not built until further down.
	const categories = SETTINGS_SCHEMA.map((category) => ({
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

	const [navStack, setNavStack] = useState([{ view: 'categories' }]);
	const currentView = navStack[navStack.length - 1];
	const pendingFocusRef = useRef(null);
	const navStackRef = useRef(navStack);
	navStackRef.current = navStack;

	const pushView = useCallback((view) => {
		setNavStack((prev) => [...prev, view]);
	}, []);

	const popView = useCallback(() => {
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
	// Null until the first open fetches what ratings the libraries actually hold.
	const [availableRatings, setAvailableRatings] = useState(null);
	const [customRowsRefreshing, setCustomRowsRefreshing] = useState(false);
	const [customRowsRefreshMessage, setCustomRowsRefreshMessage] = useState('');
	const [updateCheckState, setUpdateCheckState] = useState('idle');
	const [updateCheckMessage, setUpdateCheckMessage] = useState('');
	// This device edits the tv profile, so that is the one preselected.
	const [selectedSyncProfile, setSelectedSyncProfile] = useState('tv');
	const [profileSyncBusy, setProfileSyncBusy] = useState(false);
	const [profileSyncMessage, setProfileSyncMessage] = useState('');
	// Reset asks for a second press instead of raising a dialog.
	const [profileResetArmed, setProfileResetArmed] = useState(false);
	const [ratingsResetArmed, setRatingsResetArmed] = useState(false);
	const [tempRatingSources, setTempRatingSources] = useState([]);
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
	const [tempPinCode, setTempPinCode] = useState('0000');
	const [pinCodeError, setPinCodeError] = useState('');

	const focusViewDefault = useCallback((cv) => {
			if (cv.view === 'categories') {
				// With a query up the categories are not mounted, so the first result is
				// the only thing there is to land on.
				const results = searchResultsRef.current;
				if (searchQueryRef.current) {
					Spotlight.focus(results.length > 0
						? `settings-result-${results[0].id}`
						: 'settings-search-input');
					return;
				}
				Spotlight.focus(`cat-${categories[0]?.id || 'accountSecurity'}`);
			} else if (cv.view === 'category') {
				const subcats = getSubcategories(cv.id); // eslint-disable-line no-use-before-define
				Spotlight.focus(subcats.length > 0 ? `subcat-${subcats[0].id}` : 'category-view');
			} else if (cv.view === 'subcategory') {
				Spotlight.focus('subcategory-view');
			} else if (cv.view === 'options') {
				const idx = cv.options?.findIndex((o) => o.value === settings[cv.settingKey]);
				Spotlight.focus(idx >= 0 ? `opt-${idx}` : 'opt-0');
			} else if (cv.view === 'themes') {
				const selectedId = availableThemes.find((t) => t.id === activeThemeId)?.id;
				Spotlight.focus(selectedId ? `theme-card-${selectedId}` : 'themes-view');
			} else if (cv.view === 'themeStore') {
				Spotlight.focus('theme-store-view');
			} else if (cv.view === 'homeRows') {
				Spotlight.focus('homerows-view');
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
			} else if (cv.view === 'ratingSources') {
				Spotlight.focus('rating-sources-view');
			} else if (cv.view === 'blockedRatings') {
				Spotlight.focus('blocked-ratings-view');
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
		if (serverUrl && accessToken) {
			fetch(`${serverUrl}/System/Info`, {
				headers: { Authorization: `MediaBrowser Token="${accessToken}"` }
			})
				.then((res) => res.json())
				.then((data) => {
					if (data.Version) setServerVersion(data.Version);
				})
				.catch(() => {});
		}
	}, [serverUrl, accessToken]);

	const toggleSetting = useCallback(
		(key) => {
			updateSetting(key, !settings[key]);
		},
		[settings, updateSetting]
	);

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
		<div className={css.actionBarInline}>
			<SpottableButton
				className={css.actionButton}
				onClick={checkForUpdatesNow}
				spotlightId='check-for-updates'
			>
				{updateCheckState === 'checking' ? $L('Checking...') : (updateCheckMessage || $L('Check for Updates'))}
			</SpottableButton>
		</div>
	);

	const selectSyncProfile = useCallback((profile) => {
		setSelectedSyncProfile(profile);
		setProfileSyncMessage('');
		setProfileResetArmed(false);
	}, []);

	const handleProfileChipClick = useCallback((e) => {
		const profile = e.currentTarget?.getAttribute('data-profile');
		if (profile) selectSyncProfile(profile);
	}, [selectSyncProfile]);

	const loadSyncProfile = useCallback(async () => {
		if (profileSyncBusy) return;
		setProfileSyncBusy(true);
		setProfileSyncMessage('');
		setProfileResetArmed(false);
		try {
			const resolved = await getMoonfinResolvedProfile(selectedSyncProfile, serverUrl, accessToken);
			if (!resolved) {
				setProfileSyncMessage($L('No stored settings for this profile'));
			} else {
				const local = profileToLocal(resolved);
				const homeRows = homeRowsFromProfile(resolved);
				if (homeRows !== undefined) local.homeRows = homeRows;
				updateSettings(local);
				setProfileSyncMessage($L('Profile loaded'));
			}
		} catch (e) {
			void e;
			setProfileSyncMessage($L('Could not reach the server'));
		}
		setProfileSyncBusy(false);
	}, [profileSyncBusy, selectedSyncProfile, serverUrl, accessToken, updateSettings]);

	const pushSyncProfile = useCallback(async () => {
		if (profileSyncBusy) return;
		setProfileSyncBusy(true);
		setProfileSyncMessage('');
		setProfileResetArmed(false);
		try {
			await saveMoonfinProfile(selectedSyncProfile, localToProfile(settings), serverUrl, accessToken);
			setProfileSyncMessage($L('Settings synced to profile'));
		} catch (e) {
			void e;
			setProfileSyncMessage($L('Could not reach the server'));
		}
		setProfileSyncBusy(false);
	}, [profileSyncBusy, selectedSyncProfile, settings, serverUrl, accessToken]);

	const resetSyncProfile = useCallback(async () => {
		if (profileSyncBusy) return;
		if (!profileResetArmed) {
			setProfileResetArmed(true);
			setProfileSyncMessage(selectedSyncProfile === 'global'
				? $L('Press again to erase every stored profile on the server')
				: $L('Press again to reset this profile to global'));
			return;
		}
		setProfileSyncBusy(true);
		setProfileSyncMessage('');
		setProfileResetArmed(false);
		try {
			await deleteMoonfinProfile(selectedSyncProfile, serverUrl, accessToken);
			// What still stands on the server, admin defaults plus global when a device
			// profile was reset, is what this device should show from here on.
			let remaining = {};
			try {
				const resolved = await getMoonfinResolvedProfile(selectedSyncProfile, serverUrl, accessToken);
				if (resolved) {
					remaining = profileToLocal(resolved);
					const homeRows = homeRowsFromProfile(resolved);
					if (homeRows !== undefined) remaining.homeRows = homeRows;
				}
			} catch (e) {
				void e;
			}
			// The language seeder refills an empty audio or subtitle preference the
			// moment settings change, and that write pushes the whole profile back to
			// the server, recreating what was just deleted. Seeding here instead means
			// the reset lands already filled and nothing follows it up.
			const afterReset = {...defaultSettings, ...remaining};
			Object.assign(remaining, seedLanguagePreferences(afterReset, user?.Configuration || {}, afterReset.uiLanguage, window.navigator?.language));
			restoreSyncedDefaults(remaining);
			setProfileSyncMessage($L('Profile reset'));
		} catch (e) {
			void e;
			setProfileSyncMessage($L('Could not reach the server'));
		}
		setProfileSyncBusy(false);
	}, [profileSyncBusy, profileResetArmed, selectedSyncProfile, serverUrl, accessToken, restoreSyncedDefaults, user]);

	const renderProfileSync = () => (
		<div className={css.profileSyncBlock}>
			<div className={css.actionBarInline}>
				{PROFILE_CHIPS.map(({profile, label}) => (
					<SpottableButton
						key={profile}
						className={`${css.actionButton} ${selectedSyncProfile === profile ? css.actionButtonActive : ''}`}
						data-profile={profile}
						onClick={handleProfileChipClick}
						spotlightId={`profile-chip-${profile}`}
					>
						{label()}
					</SpottableButton>
				))}
			</div>
			<div className={css.actionBarInline}>
				<SpottableButton className={css.actionButton} onClick={loadSyncProfile} spotlightId='profile-load'>
					{$L('Load Profile')}
				</SpottableButton>
				<SpottableButton className={css.actionButton} onClick={pushSyncProfile} spotlightId='profile-push'>
					{$L('Sync to Profile')}
				</SpottableButton>
				<SpottableButton
					className={`${css.actionButton} ${css.dangerButton}`}
					onClick={resetSyncProfile}
					spotlightId='profile-reset'
				>
					{$L('Reset Profile')}
				</SpottableButton>
			</div>
			{(profileSyncBusy || profileSyncMessage) && (
				<div className={css.viewDescription}>
					{profileSyncBusy ? $L('Working...') : profileSyncMessage}
				</div>
			)}
		</div>
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

	const openParentalControls = useCallback(() => {
		pushView({view: 'blockedRatings', returnFocusTo: 'setting-parentalControls'});
		if (availableRatings === null) {
			api.getRatingFilters()
				.then((result) => {
					const ratings = (result?.OfficialRatings || [])
						.map((rating) => String(rating).trim().toUpperCase())
						.filter(Boolean);
					setAvailableRatings([...new Set(ratings)]);
				})
				.catch(() => setAvailableRatings([]));
		}
	}, [pushView, api, availableRatings]);

	const toggleBlockedRating = useCallback((rating) => {
		const current = Array.isArray(settings.blockedRatings) ? settings.blockedRatings : [];
		updateSetting('blockedRatings', current.includes(rating)
			? current.filter((value) => value !== rating)
			: [...current, rating]);
	}, [settings.blockedRatings, updateSetting]);

	const openRatingSources = useCallback(() => {
		setTempRatingSources(Array.isArray(settings.mdblistRatingSources) ? [...settings.mdblistRatingSources] : []);
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

	const saveRatingSources = useCallback(() => {
		updateSetting('mdblistRatingSources', tempRatingSources);
		popView();
	}, [tempRatingSources, updateSetting, popView]);

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

	const openPinCode = useCallback(() => {
		const currentPin = typeof settings.pinCode === 'string' && /^\d{4}$/.test(settings.pinCode)
			? settings.pinCode
			: '0000';
		setTempPinCode(currentPin);
		setPinCodeError('');
		pushView({view: 'pinCode', returnFocusTo: 'setting-pinCode'});
	}, [settings.pinCode, pushView]);

	const savePinCode = useCallback(() => {
		if (!/^\d{4}$/.test(tempPinCode)) {
			setPinCodeError($L('PIN must be exactly 4 digits.'));
			return;
		}
		updateSetting('pinCode', tempPinCode);
		setPinCodeError('');
		popView();
	}, [tempPinCode, updateSetting, popView]);

	const openSeerrHomeRows = useCallback(() => {
		pushView({view: 'seerrHomeRows', returnFocusTo: 'setting-seerrHomeRows'});
	}, [pushView]);

	const openImdbLists = useCallback(() => {
		pushView({ view: 'imdbLists', returnFocusTo: 'setting-imdbLists' });
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
		tempHomeRows, tempPluginSections, pluginSectionRenderLimit, setPluginSectionRenderLimit,
		toggleHomeRowEnabled, toggleSeerrHomeRow, openHomeRows, saveHomeRows, resetHomeRows,
		toggleHomeRow, moveHomeRowUp, moveHomeRowDown,
		togglePluginSection, movePluginSectionUp, movePluginSectionDown
	} = useHomeRowsEditor({api, settings, updateSetting, updateSettings, pushView, popView});

	const {
		tempButtons, buttonLayoutKind, openDetailButtons, openOsdButtons, openDetailMetadata,
		saveButtonLayout, resetButtonLayout, toggleLayoutButton, moveLayoutButton
	} = useButtonLayoutEditor({settings, updateSettings, pushView, popView});

	const {
		allLibraries, hiddenLibraries, libraryLoading, librarySaving,
		openLibraries, toggleLibraryVisibility, saveLibraryVisibility
	} = useLibraryVisibility({api, settings, hasMultipleServers, pushView, popView, onLibrariesChanged});

	const {
		mediaBarLibraries, mediaBarCollections, tempMediaBarLibraryIds, tempMediaBarCollectionIds,
		mediaBarSourcesLoading, openMediaBarLibraries, openMediaBarCollections,
		toggleMediaBarLibrary, toggleMediaBarCollection, saveMediaBarLibraries, saveMediaBarCollections
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
		logMessage, sendingReport, openDiagnostics, handleClearLogs, handleSendReport
	} = useDiagnosticsLog({currentViewName: currentView.view, pushView});



	// The three blocks that do not fit a plain settings row, handed to the schema so it
	// can slot them back in where they used to sit.
	const renderMoonfinStatus = () => (
		<>
			{settings.useMoonfinPlugin && moonfinStatus && <div className={css.statusMessage}>{moonfinStatus}</div>}
			{moonfinConnecting && <div className={css.authHint}>{$L('Connecting to Moonfin...')}</div>}
			{!settings.useMoonfinPlugin && (
				<div className={css.authHint}>
					{$L('Enable the Moonfin plugin to access ratings, settings sync, and {seerrLabel} proxy features. The plugin must be installed on your Jellyfin server.').replace('{seerrLabel}', seerrLabel)}
				</div>
			)}
		</>
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
		<div className={css.actionBarInline}>
			<SpottableButton
				className={`${css.actionButton} ${css.dangerButton}`}
				onClick={openClearDataDialog}
				spotlightId='clear-all-data'
			>
				{$L('Clear All Data')}
			</SpottableButton>
		</div>
	);

	const handleClearImageCache = useCallback(() => {
		clearImageCache();
		clearProxiedImageCache();
		setImageCacheCleared(true);
	}, []);

	const renderImageCacheActions = () => (
		<div className={css.actionBarInline}>
			<SpottableButton
				className={css.actionButton}
				onClick={handleClearImageCache}
				spotlightId='clear-image-cache'
			>
				{imageCacheCleared ? $L('Image cache cleared') : $L('Clear image cache')}
			</SpottableButton>
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
				await fetchCustomRow(row, {forceRefresh: true});
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
	}, [settings.customHomeRows, customRowsRefreshing]);

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
		const result = await validateCustomRow(row);
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
		editingCustomRowId, settings.customHomeRows, updateSetting, resetCustomRowForm]);

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

	const settingsCtx = useMemo(() => ({
		settings,
		capabilities,
		seerr,
		seerrLabel,
		isSeerr,
		isWebOS: isWebOS(),
		serverUrl,
		serverVersion,
		availableThemes,
		activeThemeId,
		ratingsResetArmed,
		actions: {
			openThemes,
			openThemeStore,
			openHomeRows,
			openDetailButtons,
			openOsdButtons,
			openDetailMetadata,
			openDiagnostics,
			openPinCode,
			openLibraries,
			openParentalControls,
			openQrLink,
			openRatingSources,
			openRowImageTypes,
			openExcludedGenres,
			openMediaBarLibraries,
			openMediaBarCollections,
			openScreensaverLibraries,
			openScreensaverCollections,
			openScreensaverGenres,
			openImdbLists,
			openExternalTmdbLists,
			openExternalCalendars,
			openExternalCustomRows,
			openSeerrHomeRows,
			openScreen,
			handleMoonfinToggle,
			resetRatingsSettings,
			runSetupAgain: onRunSetupWizard
		}
	}), [
		settings, capabilities, seerr, seerrLabel, isSeerr, serverUrl, ratingsResetArmed, resetRatingsSettings,
		serverVersion, availableThemes, activeThemeId, openThemes, openThemeStore, openHomeRows,
		openDetailButtons, openOsdButtons, openDetailMetadata, openDiagnostics,
		openPinCode, openLibraries, openParentalControls, openQrLink, openRatingSources, openRowImageTypes, openExcludedGenres, openMediaBarLibraries,
		openMediaBarCollections, openScreensaverLibraries, openScreensaverCollections, openScreensaverGenres,
		openImdbLists, openExternalTmdbLists, openExternalCalendars,
		openExternalCustomRows, openSeerrHomeRows, openScreen, handleMoonfinToggle, onRunSetupWizard
	]);

	const openCategory = useCallback((id) => {
		// A category holding a single screen opens it directly, the way the other
		// clients treat Account & Security and About as one page each.
		const category = SETTINGS_SCHEMA.find((c) => c.id === id);
		const visible = (category?.subcategories || [])
			.filter((sub) => sub.menu !== false && (!sub.when || sub.when(settingsCtx)));
		if (visible.length === 1) {
			pushView({
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
		pushView({
			view: 'subcategory',
			categoryId: currentView.id,
			subcategoryId: sub.id,
			label: sub.label,
			returnFocusTo: `subcat-${sub.id}`
		});
	}, [pushView, currentView.id]);

	const selectOptionValue = useCallback((value) => {
		handleOptionSelect(currentView.settingKey, value);
	}, [handleOptionSelect, currentView.settingKey]);

	const openRowsTypeOption = useCallback(() => {
		pushView({
			view: 'options',
			title: $L('Row Type'),
			options: getHomeRowsStyleOptions(),
			settingKey: 'homeRowsStyle',
			returnFocusTo: 'setting-homeRowsStyle'
		});
	}, [pushView]);

	const showMorePluginSections = useCallback(() => {
		setPluginSectionRenderLimit((prev) => Math.min(tempPluginSections.length, prev + PLUGIN_SECTION_RENDER_STEP));
	}, [setPluginSectionRenderLimit, tempPluginSections.length]);

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
		moonfinStatus: renderMoonfinStatus,
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
		aboutDataActions: renderAboutDataActions,
		imageCacheActions: renderImageCacheActions,
		checkForUpdates: renderCheckForUpdates,
		profileSync: renderProfileSync,
		playbackTimePreview: renderPlaybackTimePreview,
		screensaverPreview: renderScreensaverPreview
	};

	const rowDeps = {settings, updateSetting, toggleSetting, pushView, customRenderers};

	// Only the debounced query drives the swap, so the categories do not blink out
	// between the second keystroke and the debounce landing.
	const showSearchResults = currentView.view === 'categories' &&
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
		// this is the not-typing case and Down should enter the results.
		if (e.keyCode === 40 && searchResultsRef.current.length > 0) {
			e.preventDefault();
			Spotlight.focus(`settings-result-${searchResultsRef.current[0].id}`);
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
				icon: sub.icon
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
			returnFocusTo: `settings-result-${entry.id}`
		});
	}, [pushView]);
















	const homeRowEnabledMap = new Map((settings.homeRows || []).map((r) => [r.id, r.enabled]));

	const viewName = currentView.view;

	return (
		<div className={`${css.page}${panelMode ? ` ${css.pagePanel}` : ''}`}>
			{viewName === 'categories' && (
				<CategoriesView
					categories={categories}
					searchQuery={searchQuery}
					onSearchChange={handleSearchChange}
					onSearchKeyDown={handleSearchKeyDown}
					showSearchResults={showSearchResults}
					searchResults={searchResults}
					onOpenResult={openSearchResult}
					onResultKeyDown={handleResultKeyDown}
					onOpenCategory={openCategory}
				/>
			)}
			{viewName === 'category' && (
				<CategoryView
					title={categories.find((c) => c.id === currentView.id)?.label || $L('Settings')}
					subcategories={getSubcategories(currentView.id)}
					onOpenSubcategory={openSubcategory}
				/>
			)}
			{viewName === 'subcategory' && (
				<SubcategoryView title={currentView.label || $L('Settings')}>
					{getSubcategoryContent(currentView.categoryId, currentView.subcategoryId)}
				</SubcategoryView>
			)}
			{viewName === 'options' && (
				<OptionsView
					title={currentView.title}
					options={currentView.options}
					currentValue={currentView.settingKey === '__themeSelection' ? activeThemeId : settings[currentView.settingKey]}
					onSelect={selectOptionValue}
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
					rowsTypeCaption={getLabel(getHomeRowsStyleOptions(), settings.homeRowsStyle, $L('Modern'))}
					onOpenRowsType={openRowsTypeOption}
					tempHomeRows={tempHomeRows}
					tempPluginSections={tempPluginSections}
					pluginSectionRenderLimit={pluginSectionRenderLimit}
					onShowMoreSections={showMorePluginSections}
					onToggleHomeRow={toggleHomeRow}
					onMoveHomeRowUp={moveHomeRowUp}
					onMoveHomeRowDown={moveHomeRowDown}
					onTogglePluginSection={togglePluginSection}
					onMovePluginSectionUp={movePluginSectionUp}
					onMovePluginSectionDown={movePluginSectionDown}
					onReset={resetHomeRows}
					onSave={saveHomeRows}
				/>
			)}
			{viewName === 'buttonLayout' && (
				<ButtonLayoutView
					kind={buttonLayoutKind}
					tempButtons={tempButtons}
					onToggleButton={toggleLayoutButton}
					onMoveButton={moveLayoutButton}
					onReset={resetButtonLayout}
					onSave={saveButtonLayout}
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
					onClearLogs={handleClearLogs}
					onSendReport={handleSendReport}
				/>
			)}
			{viewName === 'seerrHomeRows' && (
				<SeerrHomeRowsView
					seerrLabel={seerrLabel}
					enabledMap={homeRowEnabledMap}
					onToggleRow={toggleSeerrHomeRow}
				/>
			)}
			{viewName === 'imdbLists' && (
				<ImdbListsView settings={settings} onUpdateSettings={updateSettings} />
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
					onCancel={popView}
					onSave={saveRatingSources}
				/>
			)}
			{viewName === 'rowImageTypes' && (
				<RowImageTypesView
					rows={(settings.homeRows || []).filter((row) => row.enabled && row.id !== 'librarybuttons')}
					overrides={settings.homeRowImageTypes || {}}
					globalLabel={getLabel(getImageTypeOptions(), settings.homeRowsImageType, $L('Poster'))}
					onCycleRow={cycleRowImageType}
				/>
			)}
			{viewName === 'qrLink' && (
				<QrLinkView title={currentView.label} url={currentView.url} onClose={popView} />
			)}
			{viewName === 'blockedRatings' && (
				<BlockedRatingsView
					ratings={[...new Set([...(availableRatings || []), ...(settings.blockedRatings || [])])].sort()}
					blocked={settings.blockedRatings || []}
					loading={availableRatings === null}
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
			{viewName === 'pinCode' && (
				<PinCodeView
					pin={tempPinCode}
					error={pinCodeError}
					onPinChange={changePinCode}
					onCancel={popView}
					onSave={savePinCode}
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
			<ClearDataDialog
				open={clearDataDialogOpen}
				onCancel={closeClearDataDialog}
				onConfirm={handleClearAllData}
			/>
		</div>
	);
};

export default Settings;
