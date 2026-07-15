import {useMemo} from 'react';
import $L from '@enact/i18n/$L';

import css from './AudioQualityBadge.module.less';

const LOSSLESS_CODECS = new Set([
	'flac', 'alac', 'wav', 'ape', 'wavpack', 'wv', 'tak', 'tta',
	'dsd', 'dsf', 'mlp', 'truehd', 'pcm'
]);

const audioStreamOf = (item) => (
	item?.MediaStreams?.find((s) => s.Type === 'Audio') ||
	item?.MediaSources?.[0]?.MediaStreams?.find((s) => s.Type === 'Audio') ||
	null
);

const formatKhz = (hz) => {
	const khz = hz / 1000;
	return Number.isInteger(khz) ? String(khz) : khz.toFixed(1);
};

// Reads whatever the track happens to carry and stays out of the way when the
// item was loaded without its media streams.
const AudioQualityBadge = ({item}) => {
	const label = useMemo(() => {
		const stream = audioStreamOf(item);
		const container = item?.MediaSources?.[0]?.Container;
		const rawCodec = stream?.Codec || container || '';
		if (!rawCodec) return '';

		const parts = [rawCodec.toUpperCase()];

		const sampleRate = stream?.SampleRate;
		if (sampleRate > 0) {
			const depth = stream?.BitDepth;
			parts.push(depth ? `${depth}/${formatKhz(sampleRate)}` : `${formatKhz(sampleRate)} kHz`);
		}

		if (LOSSLESS_CODECS.has(rawCodec.toLowerCase())) {
			parts.push($L('Lossless'));
		} else {
			const bitRate = stream?.BitRate > 0
				? stream.BitRate
				: item?.MediaSources?.find((s) => s.Bitrate > 0)?.Bitrate;
			if (bitRate > 0) parts.push(`${Math.round(bitRate / 1000)}k`);
		}

		return parts.join(' · ');
	}, [item]);

	if (!label) return null;

	return <div className={css.badge}>{label}</div>;
};

export default AudioQualityBadge;
