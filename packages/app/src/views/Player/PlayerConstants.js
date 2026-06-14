import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

export const SpottableButton = Spottable('button');
export const SpottableDiv = Spottable('div');

export const ModalContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-selected="true"]',
	straightOnly: false,
	preserveId: true
}, 'div');

export const NextEpisodeContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-spot-default="true"]',
	straightOnly: false,
	preserveId: true
}, 'div');

export const formatTime = (seconds) => {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	if (h > 0) {
		return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}
	return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatEndTime = (remainingSeconds, clockDisplay) => {
	const now = new Date();
	now.setSeconds(now.getSeconds() + remainingSeconds);
	const hours = now.getHours();
	const minutes = now.getMinutes();
	if (clockDisplay === '12-hour') {
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const h12 = hours % 12 || 12;
		const timeString = `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
		return $L('Ends at {time}').replace('{time}', timeString);
	} else {
		const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
		return $L('Ends at {time}').replace('{time}', timeString);
	}
};

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

let _qualityPresets;
export const getQualityPresets = () => (_qualityPresets ??= [
	{label: $L('Auto'), value: null},
	{label: $L('4K (60 Mbps)'), value: 60000000, minRes: 3840},
	{label: $L('1080p (20 Mbps)'), value: 20000000, minRes: 1920},
	{label: $L('1080p (10 Mbps)'), value: 10000000, minRes: 1920},
	{label: $L('720p (8 Mbps)'), value: 8000000, minRes: 1280},
	{label: $L('720p (4 Mbps)'), value: 4000000, minRes: 1280},
	{label: $L('480p (2 Mbps)'), value: 2000000, minRes: 854},
	{label: $L('360p (1 Mbps)'), value: 1000000, minRes: 640}
]);

export const CONTROLS_HIDE_DELAY = 5000;

const MaterialIcon = ({path}) => (
	<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
		<path d={path} />
	</svg>
);

export const IconPlay = () => (
	<MaterialIcon path="M320-258v-450q0-14 9-22t21-8q4 0 8 1t8 3l354 226q7 5 10.5 11t3.5 14q0 8-3.5 14T720-458L366-232q-4 2-8 3t-8 1q-12 0-21-8t-9-22Zm60-225Zm0 171 269-171-269-171v342Z" />
);

export const IconPause = () => (
	<MaterialIcon path="M585-200q-24.75 0-42.37-17.63Q525-235.25 525-260v-440q0-24.75 17.63-42.38Q560.25-760 585-760h115q24.75 0 42.38 17.62Q760-724.75 760-700v440q0 24.75-17.62 42.37Q724.75-200 700-200H585Zm-325 0q-24.75 0-42.37-17.63Q200-235.25 200-260v-440q0-24.75 17.63-42.38Q235.25-760 260-760h115q24.75 0 42.38 17.62Q435-724.75 435-700v440q0 24.75-17.62 42.37Q399.75-200 375-200H260Zm325-60h115v-440H585v440Zm-325 0h115v-440H260v440Zm0-440v440-440Zm325 0v440-440Z" />
);

export const IconRewind = () => (
	<MaterialIcon path="M807-273 544-455q-7-5-10-11.5t-3-13.5q0-7 3-13.5t10-11.5l263-182q4-3 8-4.5t9-1.5q12 0 21 8t9 22v366q0 14-9 22t-21 8q-5 0-9-1.5t-8-4.5Zm-402 0L142-455q-7-5-10-11.5t-3-13.5q0-7 3-13.5t10-11.5l263-182q4-3 8-4.5t9-1.5q12 0 21 8t9 22v366q0 14-9 22t-21 8q-5 0-9-1.5t-8-4.5Zm-13-207Zm402 0ZM392-355v-250L211-480l181 125Zm402 0v-250L613-480l181 125Z" />
);

export const IconForward = () => (
	<MaterialIcon path="M104-297v-366q0-14 9-22t21-8q5 0 9 1.5t8 4.5l263 182q7 5 10 11.5t3 13.5q0 7-3 13.5T414-455L151-273q-4 3-8 4.5t-9 1.5q-12 0-21-8t-9-22Zm407 0v-366q0-14 9-22t21-8q5 0 9 1.5t8 4.5l263 182q7 5 10 11.5t3 13.5q0 7-3 13.5T821-455L558-273q-4 3-8 4.5t-9 1.5q-12 0-21-8t-9-22ZM164-480Zm407 0ZM164-355l181-125-181-125v250Zm407 0 181-125-181-125v250Z" />
);

export const IconSubtitle = () => (
	<MaterialIcon path="M240-350h360v-60H240v60Zm420 0h60v-60h-60v60ZM240-470h60v-60h-60v60Zm120 0h360v-60H360v60ZM140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Zm0-60h680v-520H140v520Zm0 0v-520 520Z" />
);

export const IconSubtitleOff = () => (
	<MaterialIcon path="M835-42 717-160H140q-24 0-42-17.63Q80-195.25 80-220v-520q0-24 18-42t42-18h22l60 60h-82v520h519L527-350H240v-60h228L41-837l42-42L877-84l-42 42Zm36-133-51-51v-514H308l-60-60h572q23 0 41.5 18.5T880-740v520.13q0 12.02-2 22.94-2 10.93-7 21.93ZM578-470l-60-60h202v60H578Zm-338 0v-60h60v60h-60Zm324-14Zm-164 5Z" />
);

export const IconAudio = () => (
	<MaterialIcon path="M286.5-163.5Q243-207 243-270t43.5-106.5Q330-420 393-420q28 0 50.5 8t39.5 22v-450h234v135H543v435q0 63-43.5 106.5T393-120q-63 0-106.5-43.5Z" />
);

export const IconChapters = () => (
	<MaterialIcon path="M200-120v-665q0-24 18-42t42-18h440q24 0 42 18t18 42v665L480-240 200-120Zm60-91 220-93 220 93v-574H260v574Zm0-574h440-440Z" />
);

export const IconPrevious = () => (
	<MaterialIcon path="M220-270v-420q0-13 8.5-21.5T250-720q13 0 21.5 8.5T280-690v420q0 13-8.5 21.5T250-240q-13 0-21.5-8.5T220-270Zm473-3L430-455q-7-5-10-11.5t-3-13.5q0-7 3-13.5t10-11.5l263-182q4-3 8-4.5t9-1.5q12 0 21 8t9 22v366q0 14-9 22t-21 8q-5 0-9-1.5t-8-4.5Zm-13-207Zm0 125v-250L499-480l181 125Z" />
);

export const IconNext = () => (
	<MaterialIcon path="M680-270v-420q0-13 8.5-21.5T710-720q13 0 21.5 8.5T740-690v420q0 13-8.5 21.5T710-240q-13 0-21.5-8.5T680-270Zm-460-27v-366q0-14 9-22t21-8q5 0 9 1.5t8 4.5l263 182q7 5 10 11.5t3 13.5q0 7-3 13.5T530-455L267-273q-4 3-8 4.5t-9 1.5q-12 0-21-8t-9-22Zm60-183Zm0 125 181-125-181-125v250Z" />
);

export const PlaybackRateLabel = ({value}) => (
	<span style={{fontSize: '0.62em', fontWeight: 600, lineHeight: 1}} aria-hidden="true">{`${value}x`}</span>
);

export const IconQuality = () => (
	<MaterialIcon path="M513-140H140q-24 0-42-18t-18-42v-540q0-24 18-42t42-18h694q24 0 42 18t18 42v246h-60v-246H140v540h373v60ZM395-297v-346l263 173-263 173ZM730-40l-5-48q-20-6-41-17.5T650-131l-42 20-35-54 38-30q-5-23-5-41.5t5-41.5l-38-30 35-55 42 20q13-12 34-24t41-18l5-49h60l6 49q20 6 41 18t34 24l42-20 35 55-38 30q5 23 5 41.5t-5 41.5l38 30-35 54-42-20q-13 14-34 25.5T796-88l-6 48h-60Zm30-95q44 0 73-29t29-73q0-44-29-73t-73-29q-44 0-73 29t-29 73q0 44 29 73t73 29Z" />
);

export const IconInfo = () => (
	<MaterialIcon path="M453-280h60v-240h-60v240Zm50.5-323.2q9.5-9.2 9.5-22.8 0-14.45-9.48-24.22-9.48-9.78-23.5-9.78t-23.52 9.78Q447-640.45 447-626q0 13.6 9.48 22.8 9.48 9.2 23.5 9.2t23.52-9.2ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Zm.23-60Q622-140 721-239.5t99-241Q820-622 721.19-721T480-820q-141 0-240.5 98.81T140-480q0 141 99.5 240.5t241 99.5Zm-.5-340Z" />
);

export const IconCast = () => (
	<MaterialIcon path="M38-160v-94q0-35 18-63.5t50-42.5q73-32 131.5-46T358-420q62 0 120 14t131 46q32 14 50.5 42.5T678-254v94H38Zm700 0v-94q0-63-32-103.5T622-423q69 8 130 23.5t99 35.5q33 19 52 47t19 63v94H738ZM250-523q-42-42-42-108t42-108q42-42 108-42t108 42q42 42 42 108t-42 108q-42 42-108 42t-108-42Zm426 0q-42 42-108 42-11 0-24.5-1.5T519-488q24-25 36.5-61.5T568-631q0-45-12.5-79.5T519-774q11-3 24.5-5t24.5-2q66 0 108 42t42 108q0 66-42 108ZM98-220h520v-34q0-16-9.5-31T585-306q-72-32-121-43t-106-11q-57 0-106.5 11T130-306q-14 6-23 21t-9 31v34Zm324.5-346.5Q448-592 448-631t-25.5-64.5Q397-721 358-721t-64.5 25.5Q268-670 268-631t25.5 64.5Q319-541 358-541t64.5-25.5ZM358-220Zm0-411Z" />
);

export const IconZoom = () => (
	<MaterialIcon path="M820-610v-130H690v-60h130q24 0 42 18t18 42v130h-60Zm-740 0v-130q0-24 18-42t42-18h130v60H140v130H80Zm610 450v-60h130v-130h60v130q0 24-18 42t-42 18H690Zm-550 0q-24 0-42-18t-18-42v-130h60v130h130v60H140Zm60-120v-400h560v400H200Zm60-60h440v-280H260v280Zm0 0v-280 280Z" />
);

export const IconShuffle = () => (
	<MaterialIcon path="M606-160q-13 0-21.5-8.5T576-190q0-13 8.5-21.5T606-220h90L543-372q-9-9-9-21t9-21q9-9 21.5-9.5T586-415l154 153v-91q0-13 8.5-21.5T770-383q13 0 21.5 8.5T800-353v163q0 13-8.5 21.5T770-160H606Zm-436-10q-9-9-9-21t9-21l528-528h-92q-13 0-21.5-8.5T576-770q0-13 8.5-21.5T606-800h164q13 0 21.5 8.5T800-770v163q0 13-8.5 21.5T770-577q-13 0-21.5-8.5T740-607v-90L212-169q-9 9-21 8.5t-21-9.5Zm-1-579q-9-9-9-21.5t9-21.5q9-9 21-9t21 9l205 205q9 9 9.5 21t-8.5 21q-9 9-21.5 9t-21.5-9L169-749Z" />
);

export const IconRepeat = () => (
	<MaterialIcon path="m236-210 65 65q9 9 8.5 21t-8.75 21.12q-9 9.12-21.37 9.5Q267-93 258-102L141-219q-5-5-7-10.13-2-5.14-2-11 0-5.87 2-10.87 2-5 7-10l117-117q9.07-9 21.53-8.5Q292-386 301-377q8.25 9 8.63 21 .37 12-8.63 21l-65 65h464v-130q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v130q0 24.75-17.62 42.37Q724.75-210 700-210H236Zm488-480H260v130q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-130q0-24.75 17.63-42.38Q235.25-750 260-750h464l-65-65q-9-9-8.5-21t8.75-21.12q9-9.12 21.38-9.5Q693-867 702-858l117 117q5 5 7 10.13 2 5.14 2 11 0 5.87-2 10.87-2 5-7 10L702-582q-9.07 9-21.53 8.5Q668-574 659-583q-8.25-9-8.62-21-.38-12 8.62-21l65-65Z" />
);

export const IconRepeatOne = () => (
	<MaterialIcon path="M466-551h-32q-10.4 0-17.2-7.12-6.8-7.11-6.8-18 0-10.88 7.08-17.38 7.09-6.5 17.92-6.5h50q12.75 0 21.38 8.62Q515-582.75 515-570v184q0 10.4-6.5 17.2-6.5 6.8-17.38 6.8-10.89 0-18-7.08Q466-376.17 466-387v-164ZM236-210l65 65q9 9 8.5 21t-8.75 21.12q-9 9.12-21.37 9.5Q267-93 258-102L141-219q-5-5-7-10.13-2-5.14-2-11 0-5.87 2-10.87 2-5 7-10l117-117q9.07-9 21.53-8.5Q292-386 301-377q8.25 9 8.63 21 .37 12-8.63 21l-65 65h464v-130q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v130q0 24.75-17.62 42.37Q724.75-210 700-210H236Zm488-480H260v130q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-130q0-24.75 17.63-42.38Q235.25-750 260-750h464l-65-65q-9-9-8.5-21t8.75-21.12q9-9.12 21.38-9.5Q693-867 702-858l117 117q5 5 7 10.13 2 5.14 2 11 0 5.87-2 10.87-2 5-7 10L702-582q-9.07 9-21.53 8.5Q668-574 659-583q-8.25-9-8.62-21-.38-12 8.62-21l65-65Z" />
);

export const IconFavorite = () => (
	<MaterialIcon path="M458.19-144Q447-148 439-156l-53-49Q262-320 171-424.5T80-643q0-90.15 60.5-150.58Q201-854 290-854q51 0 101 24.5t89 80.5q44-56 91-80.5t99-24.5q89 0 149.5 60.42Q880-733.15 880-643q0 114-91 218.5T574-205l-53 49q-8.25 8.38-19.12 12.19Q491-140 480.19-140q-10.8 0-22-4ZM454-683q-27-49-71-80t-93-31q-66 0-108 42.5t-42 108.93q0 57.57 38.88 121.22 38.88 63.66 93 123.5Q326-338 384-286.5q58 51.5 96 86.5 38-34 96-86t112-112.5q54-60.5 93-124.19T820-643q0-66-42.5-108.5T670-794q-50 0-93.5 30.5T504-683q-5 8-11 11.5t-14 3.5q-8 0-14.5-3.5T454-683Zm26 186Z" />
);

export const IconFavoriteFilled = () => (
	<MaterialIcon path="M458.19-144Q447-148 439-156l-53-49Q262-320 171-424.5T80-643q0-90.15 60.5-150.58Q201-854 290-854q51 0 101 24.5t89 80.5q44-56 91-80.5t99-24.5q89 0 149.5 60.42Q880-733.15 880-643q0 114-91 218.5T574-205l-53 49q-8.25 8.38-19.12 12.19Q491-140 480.19-140q-10.8 0-22-4Z" />
);

export const parseLyricsResponse = (response) => {
	const rawLines = Array.isArray(response?.Lyrics) ? response.Lyrics : [];
	return rawLines
		.map((line) => {
			const startTicks = typeof line?.Start === 'number' ? line.Start : null;
			return {
				startSeconds: startTicks !== null ? (startTicks / 10000000) : null,
				text: (line?.Text || '').replace(/\r/g, '').trim()
			};
		})
		.filter((line) => line.text)
		.sort((a, b) => {
			const aTime = typeof a.startSeconds === 'number' ? a.startSeconds : Number.MAX_SAFE_INTEGER;
			const bTime = typeof b.startSeconds === 'number' ? b.startSeconds : Number.MAX_SAFE_INTEGER;
			return aTime - bTime;
		});
};

export const withTimeout = (promise, timeoutMs) => {
	let timeoutId;
	const timeoutPromise = new Promise((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
	});
	return Promise.race([promise, timeoutPromise]).then(
		function (val) { clearTimeout(timeoutId); return val; },
		function (err) { clearTimeout(timeoutId); throw err; }
	);
};
