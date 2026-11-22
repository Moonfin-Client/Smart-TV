import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import Scroller from '@enact/sandstone/Scroller';
import Slider from '@enact/sandstone/Slider';
import {useCallback, useEffect} from 'react';
import $L from '@enact/i18n/$L';
import {useSettings} from '../../context/SettingsContext';
import {isBackKey} from '../../utils/keys';
import {retrySubtitleFont, subtitleFontFailed} from '../../services/subtitleFonts';
import {
	getSubtitleBackgroundColorOptions, getSubtitleColorOptions, getSubtitleShadowColorOptions,
	resolveSubtitleStyleSettings, subtitleStyleKey
} from '../../utils/subtitleConstants';
import {getSubtitleFontOptions, getSubtitleStrokeWidthOptions} from '../Settings/settingsOptions';

import css from './Player.module.less';

const SpottableButton = Spottable('button');

const SettingsContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	defaultElement: '[data-spot-default="true"]',
	straightOnly: false,
	leaveFor: {left: '', right: '', up: '', down: ''},
	preserveId: true
}, 'div');

const getSubtitleSizeOptions = () => [
	{value: 'small', label: $L('Small')},
	{value: 'medium', label: $L('Medium')},
	{value: 'large', label: $L('Large')},
	{value: 'xlarge', label: $L('Extra Large')}
];

const getSubtitlePositionOptions = () => [
	{value: 'bottom', label: $L('Bottom')},
	{value: 'lower', label: $L('Lower')},
	{value: 'middle', label: $L('Middle')},
	{value: 'higher', label: $L('Higher')},
	{value: 'absolute', label: $L('Absolute')}
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

const SubtitleSettingsOverlay = ({visible, onClose, isHdr = false}) => {
	const {settings, updateSetting} = useSettings();
	const hdrActive = Boolean(isHdr && settings.subtitleHdrSeparate);
	const style = resolveSubtitleStyleSettings(settings, isHdr);
	const keyFor = useCallback((key) => subtitleStyleKey(key, hdrActive), [hdrActive]);

	const SUBTITLE_SIZE_OPTIONS = getSubtitleSizeOptions();
	const SUBTITLE_COLOR_OPTIONS = getSubtitleColorOptions();
	const SUBTITLE_POSITION_OPTIONS = getSubtitlePositionOptions();
	const SUBTITLE_SHADOW_COLOR_OPTIONS = getSubtitleShadowColorOptions();
	const SUBTITLE_BACKGROUND_COLOR_OPTIONS = getSubtitleBackgroundColorOptions();
	const SUBTITLE_STROKE_WIDTH_OPTIONS = getSubtitleStrokeWidthOptions();
	const SUBTITLE_FONT_OPTIONS = getSubtitleFontOptions();

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
		cycleOption(getSubtitleSizeOptions(), style.subtitleSize, updateSetting, keyFor('subtitleSize'));
	}, [style.subtitleSize, updateSetting, keyFor]);

	const handleCyclePosition = useCallback(() => {
		cycleOption(getSubtitlePositionOptions(), style.subtitlePosition, updateSetting, keyFor('subtitlePosition'));
	}, [style.subtitlePosition, updateSetting, keyFor]);

	const handleCycleColor = useCallback(() => {
		cycleOption(getSubtitleColorOptions(), style.subtitleColor, updateSetting, keyFor('subtitleColor'));
	}, [style.subtitleColor, updateSetting, keyFor]);

	const handleCycleShadowColor = useCallback(() => {
		cycleOption(getSubtitleShadowColorOptions(), style.subtitleShadowColor, updateSetting, keyFor('subtitleShadowColor'));
	}, [style.subtitleShadowColor, updateSetting, keyFor]);

	const handleCycleBackgroundColor = useCallback(() => {
		cycleOption(getSubtitleBackgroundColorOptions(), style.subtitleBackgroundColor, updateSetting, keyFor('subtitleBackgroundColor'));
	}, [style.subtitleBackgroundColor, updateSetting, keyFor]);

	const handleCycleStrokeWidth = useCallback(() => {
		cycleOption(getSubtitleStrokeWidthOptions(), style.subtitleStrokeWidth, updateSetting, 'subtitleStrokeWidth');
	}, [style.subtitleStrokeWidth, updateSetting]);

	const handleCycleFont = useCallback(() => {
		cycleOption(getSubtitleFontOptions(), style.subtitleFont, (key, family) => {
			retrySubtitleFont(family);
			updateSetting(key, family);
		}, 'subtitleFont');
	}, [style.subtitleFont, updateSetting]);

	const handleToggleBold = useCallback(() => {
		updateSetting(keyFor('subtitleBold'), !style.subtitleBold);
	}, [style.subtitleBold, updateSetting, keyFor]);

	const handleToggleDropShadow = useCallback(() => {
		updateSetting('subtitleDropShadow', !style.subtitleDropShadow);
	}, [style.subtitleDropShadow, updateSetting]);

	const handlePositionAbsoluteChange = useCallback((e) => {
		updateSetting(keyFor('subtitlePositionAbsolute'), e.value);
	}, [updateSetting, keyFor]);

	const handleOpacityChange = useCallback((e) => {
		updateSetting(keyFor('subtitleOpacity'), e.value);
	}, [updateSetting, keyFor]);

	const handleShadowOpacityChange = useCallback((e) => {
		updateSetting(keyFor('subtitleShadowOpacity'), e.value);
	}, [updateSetting, keyFor]);

	const handleShadowBlurChange = useCallback((e) => {
		updateSetting(keyFor('subtitleShadowBlur'), e.value);
	}, [updateSetting, keyFor]);

	const handleBackgroundChange = useCallback((e) => {
		updateSetting(keyFor('subtitleBackground'), e.value);
	}, [updateSetting, keyFor]);

	const handleDropShadowIntensityChange = useCallback((e) => {
		updateSetting('subtitleDropShadowIntensity', e.value);
	}, [updateSetting]);

	const handleDropShadowOffsetChange = useCallback((e) => {
		updateSetting('subtitleDropShadowOffset', e.value);
	}, [updateSetting]);

	const handleDropShadowBlurChange = useCallback((e) => {
		updateSetting('subtitleDropShadowBlur', e.value);
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
							{getLabel(SUBTITLE_SIZE_OPTIONS, style.subtitleSize, $L('Medium'))}
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
							{getLabel(SUBTITLE_POSITION_OPTIONS, style.subtitlePosition, $L('Bottom'))}
						</span>
					</SpottableButton>

					{/* Absolute Position Slider */}
					{style.subtitlePosition === 'absolute' && (
						<div className={css.sliderItem}>
							<div className={css.sliderLabel}>
								<span>{$L('Absolute Position')}</span>
								<span className={css.sliderValue}>{style.subtitlePositionAbsolute}%</span>
							</div>
							<Slider
								min={0}
								max={100}
								step={5}
								value={style.subtitlePositionAbsolute}
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
							<span className={css.sliderValue}>{style.subtitleOpacity}%</span>
						</div>
						<Slider
							min={0}
							max={100}
							step={5}
							value={style.subtitleOpacity}
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
						<span className={css.settingLabel}>{$L('Text Fill Color')}</span>
						<span className={css.settingValue}>
							{getLabel(SUBTITLE_COLOR_OPTIONS, style.subtitleColor, $L('White'))}
						</span>
					</SpottableButton>

					<SpottableButton
						className={css.settingItem}
						onClick={handleToggleBold}
						spotlightId="sub-setting-bold"
					>
						<span className={css.settingLabel}>{$L('Bold Text')}</span>
						<span className={css.settingValue}>{style.subtitleBold ? $L('On') : $L('Off')}</span>
					</SpottableButton>

					<SpottableButton
						className={css.settingItem}
						onClick={handleCycleFont}
						spotlightId="sub-setting-font"
					>
						<span className={css.settingLabel}>{$L('Font')}</span>
						<span className={css.settingValue}>
							{subtitleFontFailed(style.subtitleFont)
								? $L("Couldn't download {font}").replace('{font}', style.subtitleFont)
								: getLabel(SUBTITLE_FONT_OPTIONS, style.subtitleFont, $L('Default'))}
						</span>
					</SpottableButton>

					<div className={css.divider} />

					<SpottableButton
						className={css.settingItem}
						onClick={handleCycleShadowColor}
						spotlightId="sub-setting-shadowColor"
					>
						<span className={css.settingLabel}>{$L('Text Stroke Color')}</span>
						<span className={css.settingValue}>
							{getLabel(SUBTITLE_SHADOW_COLOR_OPTIONS, style.subtitleShadowColor, $L('Black'))}
						</span>
					</SpottableButton>

					<div className={css.sliderItem}>
						<div className={css.sliderLabel}>
							<span>{$L('Text Stroke Opacity')}</span>
							<span className={css.sliderValue}>{style.subtitleShadowOpacity}%</span>
						</div>
						<Slider
							min={0}
							max={100}
							step={5}
							value={style.subtitleShadowOpacity}
						onChange={handleShadowOpacityChange}
							className={css.settingsSlider}
							tooltip={false}
							spotlightId="sub-setting-shadowOpacity"
						/>
					</div>

					<div className={css.sliderItem}>
						<div className={css.sliderLabel}>
							<span>{$L('Text Stroke Blur')}</span>
							<span className={css.sliderValue}>
								{style.subtitleShadowBlur ? style.subtitleShadowBlur.toFixed(1) : '0.1'}
							</span>
						</div>
						<Slider
							min={0}
							max={1}
							step={0.1}
							value={style.subtitleShadowBlur || 0.1}
						onChange={handleShadowBlurChange}
							className={css.settingsSlider}
							tooltip={false}
							spotlightId="sub-setting-shadowBlur"
						/>
					</div>

					<SpottableButton
						className={css.settingItem}
						onClick={handleCycleStrokeWidth}
						spotlightId="sub-setting-strokeWidth"
					>
						<span className={css.settingLabel}>{$L('Text Stroke Width')}</span>
						<span className={css.settingValue}>
							{getLabel(SUBTITLE_STROKE_WIDTH_OPTIONS, style.subtitleStrokeWidth, $L('Default'))}
						</span>
					</SpottableButton>

					<div className={css.divider} />

					<SpottableButton
						className={css.settingItem}
						onClick={handleToggleDropShadow}
						spotlightId="sub-setting-dropShadow"
					>
						<span className={css.settingLabel}>{$L('Text Shadow')}</span>
						<span className={css.settingValue}>{style.subtitleDropShadow ? $L('On') : $L('Off')}</span>
					</SpottableButton>

					{style.subtitleDropShadow && (
						<>
							<div className={css.sliderItem}>
								<div className={css.sliderLabel}>
									<span>{$L('Shadow Intensity')}</span>
									<span className={css.sliderValue}>{style.subtitleDropShadowIntensity}%</span>
								</div>
								<Slider
									min={10}
									max={100}
									step={10}
									value={style.subtitleDropShadowIntensity}
									onChange={handleDropShadowIntensityChange}
									className={css.settingsSlider}
									tooltip={false}
									spotlightId="sub-setting-dropShadowIntensity"
								/>
							</div>

							<div className={css.sliderItem}>
								<div className={css.sliderLabel}>
									<span>{$L('Shadow Offset')}</span>
									<span className={css.sliderValue}>{style.subtitleDropShadowOffset}</span>
								</div>
								<Slider
									min={0}
									max={8}
									step={1}
									value={style.subtitleDropShadowOffset}
									onChange={handleDropShadowOffsetChange}
									className={css.settingsSlider}
									tooltip={false}
									spotlightId="sub-setting-dropShadowOffset"
								/>
							</div>

							<div className={css.sliderItem}>
								<div className={css.sliderLabel}>
									<span>{$L('Shadow Blur')}</span>
									<span className={css.sliderValue}>{style.subtitleDropShadowBlur}</span>
								</div>
								<Slider
									min={0}
									max={8}
									step={1}
									value={style.subtitleDropShadowBlur}
									onChange={handleDropShadowBlurChange}
									className={css.settingsSlider}
									tooltip={false}
									spotlightId="sub-setting-dropShadowBlur"
								/>
							</div>
						</>
					)}

					<div className={css.divider} />

					{/* Background Color */}
					<SpottableButton
						className={css.settingItem}
						onClick={handleCycleBackgroundColor}
						spotlightId="sub-setting-bgColor"
					>
						<span className={css.settingLabel}>{$L('Background Color')}</span>
						<span className={css.settingValue}>
							{getLabel(SUBTITLE_BACKGROUND_COLOR_OPTIONS, style.subtitleBackgroundColor, $L('Black'))}
						</span>
					</SpottableButton>

					{/* Background Opacity */}
					<div className={css.sliderItem}>
						<div className={css.sliderLabel}>
							<span>{$L('Background Opacity')}</span>
							<span className={css.sliderValue}>{style.subtitleBackground}%</span>
						</div>
						<Slider
							min={0}
							max={100}
							step={5}
							value={style.subtitleBackground}
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
