/* eslint-disable react/jsx-no-bind */
import {Fragment} from 'react';

import {getChipLabel} from './settingsOptions';
import {KIND, resolve} from './settingsSchema';
import {SectionTitle, ToggleRow, OptionRow, SliderRow, NavRow, InfoRow} from './settingsRows';

import css from './Settings.module.less';

// Turns one schema descriptor into the row it describes. The schema is plain data so it can
// also be walked by the search index, which is why nothing here is decided by the row itself.
const renderDescriptorRow = (row, ctx, index, deps) => {
	if (row.when && !row.when(ctx)) return null;
	const {settings, updateSetting, toggleSetting, pushView, customRenderers} = deps;
	const text = (value) => resolve(value, ctx);

	switch (row.kind) {
		case KIND.SECTION:
			return <Fragment key={`section-${row.id}`}><SectionTitle>{text(row.label)}</SectionTitle></Fragment>;
		case KIND.DIVIDER:
			return <div key={`divider-${row.id || index}`} className={css.divider} />;
		case KIND.TEXT:
			return <div key={`text-${row.id}`} className={css.viewDescription}>{text(row.text)}</div>;
		case KIND.TOGGLE:
			return (
				<ToggleRow
					key={row.key}
					settingKey={row.key}
					title={text(row.label)}
					desc={text(row.desc)}
					icon={text(row.icon)}
					checked={row.isOn ? row.isOn(ctx) : settings[row.key]}
					onToggle={row.onToggle ? () => row.onToggle(ctx) : () => toggleSetting(row.key)}
				/>
			);
		case KIND.OPTION: {
			const options = row.options(ctx);
			const title = text(row.label);
			const value = row.value ? row.value(ctx) : settings[row.key];
			const onSelect = row.onSelect ? (picked) => row.onSelect(ctx, picked) : null;
			return (
				<OptionRow
					key={row.key}
					settingKey={row.key}
					title={title}
					desc={text(row.desc)}
					caption={getChipLabel(options, value, text(row.fallback))}
					swatch={row.swatch ? row.swatch(ctx) : null}
					padded={row.padded}
					valueAsSubtitle={row.valueAsSubtitle}
					colorTile={row.colorTile ? row.colorTile(ctx) : null}
					plainIcon={row.plainIcon}
					icon={text(row.icon)}
					onOpen={() => pushView({view: 'options', title, options, settingKey: row.key, value, onSelect, swatchOf: row.swatchOf, swatchEdge: row.swatchEdge, subtitleOf: row.subtitleOf, returnFocusTo: `setting-${row.key}`})}
				/>
			);
		}
		case KIND.SLIDER:
			return (
				<SliderRow
					key={row.key}
					settingKey={row.key}
					title={text(row.label)}
					desc={text(row.desc)}
					min={row.min}
					max={row.max}
					step={row.step}
					value={settings[row.key]}
					format={row.format}
					icon={text(row.icon)}
					plainIcon={row.plainIcon}
					onChange={(e) => updateSetting(row.key, e.value)}
				/>
			);
		case KIND.NAV:
			// A row that opens a checklist ends in what's picked, the way a picker row does
			if (row.bubble) {
				return (
					<OptionRow
						key={row.id}
						settingKey={row.id}
						title={text(row.label)}
						desc={text(row.desc)}
						caption={text(row.bubble)}
						padded
						icon={text(row.icon)}
						onOpen={() => row.action(ctx)}
					/>
				);
			}
			return (
				<NavRow
					key={row.id}
					id={row.id}
					title={text(row.label)}
					desc={text(row.desc)}
					icon={text(row.icon)}
					chevron={row.chevron !== false}
					onClick={() => row.action(ctx)}
				/>
			);
		case KIND.INFO:
			return (
				<InfoRow
					key={row.id}
					id={row.id}
					label={text(row.label)}
					value={text(row.value)}
					icon={text(row.icon)}
					onClick={row.onSelect ? () => row.onSelect(ctx) : undefined}
				/>
			);
		case KIND.CUSTOM:
			return <Fragment key={`custom-${row.render}`}>{customRenderers[row.render]?.()}</Fragment>;
		default:
			return null;
	}
};

export default renderDescriptorRow;
