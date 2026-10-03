/* eslint-disable react/jsx-no-bind */
import {Fragment} from 'react';

import {getLabel} from './settingsOptions';
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
					checked={settings[row.key]}
					onToggle={row.onToggle ? () => row.onToggle(ctx) : () => toggleSetting(row.key)}
				/>
			);
		case KIND.OPTION: {
			const options = row.options(ctx);
			const title = text(row.label);
			return (
				<OptionRow
					key={row.key}
					settingKey={row.key}
					title={title}
					caption={getLabel(options, settings[row.key], text(row.fallback))}
					swatch={options.find((o) => o.value === settings[row.key])?.swatch}
					icon={text(row.icon)}
					onOpen={() => pushView({view: 'options', title, options, settingKey: row.key, returnFocusTo: `setting-${row.key}`})}
				/>
			);
		}
		case KIND.SLIDER:
			return (
				<SliderRow
					key={row.key}
					settingKey={row.key}
					title={text(row.label)}
					min={row.min}
					max={row.max}
					step={row.step}
					value={settings[row.key]}
					format={row.format}
					icon={text(row.icon)}
					onChange={(e) => updateSetting(row.key, e.value)}
				/>
			);
		case KIND.NAV:
			return (
				<NavRow
					key={row.id}
					id={row.id}
					title={text(row.label)}
					desc={text(row.desc)}
					icon={text(row.icon)}
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
				/>
			);
		case KIND.CUSTOM:
			return <Fragment key={`custom-${row.render}`}>{customRenderers[row.render]?.()}</Fragment>;
		default:
			return null;
	}
};

export default renderDescriptorRow;
