import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import Scroller from '@enact/sandstone/Scroller';
import Slider from '@enact/sandstone/Slider';
import {useCallback, useEffect} from 'react';
import $L from '@enact/i18n/$L';
import {useSettings} from '../../context/SettingsContext';
import {isBackKey} from '../../utils/keys';

import css from './Player.module.less';

const SpottableButton = Spottable('button');

const SettingsContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-spot-default="true"]',
	straightOnly: false,
	preserveId: true
}, 'div');

const getSubtitleSizeOptions = () => [
	{value: 'small', label: $L('Small')},
	{value: 'medium', label: $L('Medium')},
	{value: 'large', label: $L('Large')},
	{value: 'xlarge', label: $L('Extra Large')}
];

const getSubtitleColorOptions = () => [
	{value: '#ffffff', label: $L('White')},
	{value: '#ffff00', label: $L('Yellow')},
	{value: '#00ffff', label: $L('Cyan')},
	{value: '#ff00ff', label: $L('Magenta')},
	{value: '#00ff00', label: $L('Green')},
	{value: '#ff0000', label: $L('Red')},
	{value: '#808080', label: $L('Grey')},
	{value: '#404040', label: $L('Dark Grey')}
];

const getSubtitlePositionOptions = () => [
	{value: 'bottom', label: $L('Bottom')},
	{value: 'lower', label: $L('Lower')},
	{value: 'middle', label: $L('Middle')},
	{value: 'higher', label: $L('Higher')},
	{value: 'absolute', label: $L('Absolute')}
];

const getSubtitleShadowColorOptions = () => [
	{value: '#000000', label: $L('Black')},
	{value: '#ffffff', label: $L('White')},
	{value: '#808080', label: $L('Grey')},
	{value: '#404040', label: $L('Dark Grey')},
	{value: '#ff0000', label: $L('Red')},
	{value: '#00ff00', label: $L('Green')},
	{value: '#0000ff', label: $L('Blue')}
];

const getSubtitleBackgroundColorOptions = () => [
	{value: '#000000', label: $L('Black')},
	{value: '#ffffff', label: $L('White')},
	{value: '#808080', label: $L('Grey')},
	{value: '#404040', label: $L('Dark Grey')},
	{value: '#000080', label: $L('Navy')}
];

const cycleOption = (options, currentValue, updateSetting, settingKey) => {
	const currentIndex = options.findIndex(o => o.value === currentValue);
	const index = currentIndex === -1 ? 0 : currentIndex;
	const nextIndex = (index + 1) % options.length;
	updateSetting(settingKey, options[nextIndex].value);
};

const getLabel = (options, currentValue, fallback) => {
	const option = options.find(o => o.value === currentValue);
	return option?.label || fallback;
};

const stopPropagation = (e) => e.stopPropagation();

const SubtitleSettingsOverlay = ({visible, onClose}) => {
	const {settings, updateSetting} = useSettings();

	const SUBTITLE_SIZE_OPTIONS = getSubtitleSizeOptions();
	const SUBTITLE_COLOR_OPTIONS = getSubtitleColorOptions();
	const SUBTITLE_POSITION_OPTIONS = getSubtitlePositionOptions();
	const SUBTITLE_SHADOW_COLOR_OPTIONS = getSubtitleShadowColorOptions();
	const SUBTITLE_BACKGROUND_COLOR_OPTIONS = getSubtitleBackgroundColorOptions();

	useEffect(() => {
		if (visible) {
			setTimeout(() => {
				Spotlight.focus('sub-setting-size');
			}, 100);
		}
	}, [visible]);

	useEffect(() => {
		if (!visible) return;

		const handleKeyDown = (e) => {
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [visible, onClose]);

	const handleCycleSize = useCallback(() => {
		cycleOption(getSubtitleSizeOptions(), settings.subtitleSize, updateSetting, 'subtitleSize');
	}, [settings.subtitleSize, updateSetting]);

	const handleCyclePosition = useCallback(() => {
		cycleOption(getSubtitlePositionOptions(), settings.subtitlePosition, updateSetting, 'subtitlePosition');
	}, [settings.subtitlePosition, updateSetting]);

	const handleCycleColor = useCallback(() => {
		cycleOption(getSubtitleColorOptions(), settings.subtitleColor, updateSetting, 'subtitleColor');
	}, [settings.subtitleColor, updateSetting]);

	const handleCycleShadowColor = useCallback(() => {
		cycleOption(getSubtitleShadowColorOptions(), settings.subtitleShadowColor, updateSetting, 'subtitleShadowColor');
	}, [settings.subtitleShadowColor, updateSetting]);

	const handleCycleBackgroundColor = useCallback(() => {
		cycleOption(getSubtitleBackgroundColorOptions(), settings.subtitleBackgroundColor, updateSetting, 'subtitleBackgroundColor');
	}, [settings.subtitleBackgroundColor, updateSetting]);

	const handlePositionAbsoluteChange = useCallback((e) => {
		updateSetting('subtitlePositionAbsolute', e.value);
	}, [updateSetting]);

	const handleOpacityChange = useCallback((e) => {
		updateSetting('subtitleOpacity', e.value);
	}, [updateSetting]);

	const handleShadowOpacityChange = useCallback((e) => {
		updateSetting('subtitleShadowOpacity', e.value);
	}, [updateSetting]);

	const handleShadowBlurChange = useCallback((e) => {
		updateSetting('subtitleShadowBlur', e.value);
	}, [updateSetting]);

	const handleBackgroundChange = useCallback((e) => {
		updateSetting('subtitleBackground', e.value);
	}, [updateSetting]);

	if (!visible) return null;

	return (
		<div className={css.trackModal} onClick={onClose}>
			<SettingsContainer
				className={`${css.modalContent} ${css.settingsModal}`}
				onClick={stopPropagation}
				spotlightId="subtitle-settings-modal"
			>
				<h2 className={css.modalTitle}>{$L('Subtitle Appearance')}</h2>
				<Scroller
					direction="vertical"
					horizontalScrollbar="hidden"
					verticalScrollbar="hidden"
					style={{flex: 1, maxHeight: '60vh'}}
				>
					{/* Size */}
					<SpottableButton
						className={css.settingItem}
						onClick={handleCycleSize}
						spotlightId="sub-setting-size"
						data-spot-default="true"
					>
						<span className={css.settingLabel}>{$L('Size')}</span>
						<span className={css.settingValue}>
							{getLabel(SUBTITLE_SIZE_OPTIONS, settings.subtitleSize, $L('Medium'))}
						</span>
					</SpottableButton>

					{/* Position */}
					<SpottableButton
						className={css.settingItem}
						onClick={handleCyclePosition}
						spotlightId="sub-setting-position"
					>
						<span className={css.settingLabel}>{$L('Position')}</span>
						<span className={css.settingValue}>
							{getLabel(SUBTITLE_POSITION_OPTIONS, settings.subtitlePosition, $L('Bottom'))}
						</span>
					</SpottableButton>

					{/* Absolute Position Slider */}
					{settings.subtitlePosition === 'absolute' && (
						<div className={css.sliderItem}>
							<div className={css.sliderLabel}>
								<span>{$L('Absolute Position')}</span>
								<span className={css.sliderValue}>{settings.subtitlePositionAbsolute}%</span>
							</div>
							<Slider
								min={0}
								max={100}
								step={5}
								value={settings.subtitlePositionAbsolute}
							onChange={handlePositionAbsoluteChange}
								className={css.settingsSlider}
								tooltip={false}
								spotlightId="sub-setting-positionAbsolute"
							/>
						</div>
					)}

					<div className={css.divider} />

					{/* Opacity */}
					<div className={css.sliderItem}>
						<div className={css.sliderLabel}>
							<span>{$L('Text Opacity')}</span>
							<span className={css.sliderValue}>{settings.subtitleOpacity}%</span>
						</div>
						<Slider
							min={0}
							max={100}
							step={5}
							value={settings.subtitleOpacity}
						onChange={handleOpacityChange}
							className={css.settingsSlider}
							tooltip={false}
							spotlightId="sub-setting-opacity"
						/>
					</div>

					{/* Text Color */}
					<SpottableButton
						className={css.settingItem}
						onClick={handleCycleColor}
						spotlightId="sub-setting-color"
					>
						<span className={css.settingLabel}>{$L('Text Color')}</span>
						<span className={css.settingValue}>
							{getLabel(SUBTITLE_COLOR_OPTIONS, settings.subtitleColor, $L('White'))}
						</span>
					</SpottableButton>

					<div className={css.divider} />

					{/* Shadow Color */}
					<SpottableButton
						className={css.settingItem}
						onClick={handleCycleShadowColor}
						spotlightId="sub-setting-shadowColor"
					>
						<span className={css.settingLabel}>{$L('Shadow Color')}</span>
						<span className={css.settingValue}>
							{getLabel(SUBTITLE_SHADOW_COLOR_OPTIONS, settings.subtitleShadowColor, $L('Black'))}
						</span>
					</SpottableButton>

					{/* Shadow Opacity */}
					<div className={css.sliderItem}>
						<div className={css.sliderLabel}>
							<span>{$L('Shadow Opacity')}</span>
							<span className={css.sliderValue}>{settings.subtitleShadowOpacity}%</span>
						</div>
						<Slider
							min={0}
							max={100}
							step={5}
							value={settings.subtitleShadowOpacity}
						onChange={handleShadowOpacityChange}
							className={css.settingsSlider}
							tooltip={false}
							spotlightId="sub-setting-shadowOpacity"
						/>
					</div>

					{/* Shadow Blur */}
					<div className={css.sliderItem}>
						<div className={css.sliderLabel}>
							<span>{$L('Shadow Size (Blur)')}</span>
							<span className={css.sliderValue}>
								{settings.subtitleShadowBlur ? settings.subtitleShadowBlur.toFixed(1) : '0.1'}
							</span>
						</div>
						<Slider
							min={0}
							max={1}
							step={0.1}
							value={settings.subtitleShadowBlur || 0.1}
						onChange={handleShadowBlurChange}
							className={css.settingsSlider}
							tooltip={false}
							spotlightId="sub-setting-shadowBlur"
						/>
					</div>

					<div className={css.divider} />

					{/* Background Color */}
					<SpottableButton
						className={css.settingItem}
						onClick={handleCycleBackgroundColor}
						spotlightId="sub-setting-bgColor"
					>
						<span className={css.settingLabel}>{$L('Background Color')}</span>
						<span className={css.settingValue}>
							{getLabel(SUBTITLE_BACKGROUND_COLOR_OPTIONS, settings.subtitleBackgroundColor, $L('Black'))}
						</span>
					</SpottableButton>

					{/* Background Opacity */}
					<div className={css.sliderItem}>
						<div className={css.sliderLabel}>
							<span>{$L('Background Opacity')}</span>
							<span className={css.sliderValue}>{settings.subtitleBackground}%</span>
						</div>
						<Slider
							min={0}
							max={100}
							step={5}
							value={settings.subtitleBackground}
						onChange={handleBackgroundChange}
							className={css.settingsSlider}
							tooltip={false}
							spotlightId="sub-setting-bgOpacity"
						/>
					</div>
				</Scroller>

				<SpottableButton className={css.closeBtn} onClick={onClose} spotlightId="sub-settings-close">
					{$L('Press BACK to close')}
				</SpottableButton>
			</SettingsContainer>
		</div>
	);
};

export default SubtitleSettingsOverlay;
