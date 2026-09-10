import {DETAIL_ICON_PATHS} from '../../views/Details/detailIcons';

const SyncPlayIcon = ({className, style}) => (
	<svg className={className} style={style} viewBox="0 -960 960 960" fill="currentColor">
		<path d={DETAIL_ICON_PATHS.group} />
	</svg>
);

export default SyncPlayIcon;
