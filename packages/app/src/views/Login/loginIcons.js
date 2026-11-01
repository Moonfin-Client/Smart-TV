// Icons for the sign-in screens. Each server logo is its brand's own outline, so a
// saved server is recognizable at a glance before its name has been read.

const JELLYFIN_PATH = 'M127.998 39.598C104.6 39.598 29.281 176.145 40.766 199.206C52.251 222.267 203.874 222 215.233 199.206C226.592 176.412 151.395 39.598 127.998 39.598ZM128.009 74.617C143.338 74.617 192.609 164.251 185.166 179.198C177.724 194.14 78.384 194.307 70.854 179.198C63.324 164.089 112.681 74.617 128.009 74.617ZM127.998 107.341C120.233 107.341 95.235 152.658 99.05 160.31C102.865 167.962 153.178 167.878 156.948 160.31C160.718 152.742 136.763 107.344 127.998 107.341Z';

const EMBY_PATH = 'M327.065 642.186C281.668 596.326 244.327 558.818 244.085 558.834C243.842 558.851 236.852 565.494 228.55 573.596L213.456 588.328L173.32 547.94C151.245 525.727 108.736 482.865 78.854 452.692L24.525 397.831L108.245 314.923L191.965 232.015L176.772 216.811L161.579 201.607L256.759 107.314C309.108 55.453 352.117 13.021 352.336 13.021C352.554 13.021 389.731 50.379 434.952 96.038C480.173 141.697 517.49 179.17 517.879 179.311C518.268 179.452 525.342 172.816 533.6 164.565L548.613 149.563L555.759 156.762C629.711 231.264 737.265 340.326 737.126 340.673C737.025 340.924 699.585 378.114 653.926 423.318C608.267 468.522 570.818 505.732 570.707 506.007C570.596 506.282 577.212 513.355 585.41 521.725L600.315 536.944L584.926 552.233C563.83 573.192 421.974 713.503 415.13 720.18L409.605 725.57ZM416.917 438.029C481.765 400.495 534.736 369.481 534.63 369.108C534.471 368.549 301.08 232.859 298.359 231.743C297.675 231.462 297.501 259.199 297.501 369.083C297.501 468.919 297.708 506.705 298.256 506.523C298.671 506.385 352.068 475.562 416.917 438.029Z';

// The chevron Plex marks itself with.
const PLEX_PATH = 'M64 24H128L192 128L128 232H64L128 128Z';

// Silo's glyph: a silo whose bands show what's behind it.
const SILO_PATH = 'M6 9A6 6 0 0 1 18 9V10.8H6ZM6 12.2H18V14.3H6ZM6 15.7H18V17.8H6ZM6 19.2H18V21H6Z';

export const BRAND_NAMES = {jellyfin: 'Jellyfin', emby: 'Emby', plex: 'Plex', silo: 'Silo'};

export const ServerTypeIcon = ({serverType, className}) => {
	if (serverType === 'silo') {
		return (
			<svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d={SILO_PATH} />
			</svg>
		);
	}
	if (serverType === 'plex') {
		return (
			<svg className={className} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
				<path d={PLEX_PATH} />
			</svg>
		);
	}
	return serverType === 'emby' ? (
		<svg className={className} viewBox="0 0 712.601 712.601" fill="currentColor" aria-hidden="true">
			<g transform="translate(64 64) scale(0.82)">
				<path d={EMBY_PATH} />
			</g>
		</svg>
	) : (
		<svg className={className} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
			<path d={JELLYFIN_PATH} />
		</svg>
	);
};
