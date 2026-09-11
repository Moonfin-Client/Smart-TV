import $L from '@enact/i18n/$L';

import css from './AnimeMarkerPills.module.less';

// AnimeEpisodeKind.
const KIND_PILLS = {
	Filler: {label: 'Filler', tone: css.filler},
	Mixed: {label: 'Mixed Canon/Filler', tone: css.mixed},
	MangaCanon: {label: 'Manga Canon', tone: css.mangaCanon},
	AnimeCanon: {label: 'Anime Canon', tone: css.animeCanon}
};

// AnimeAudioKind
const AUDIO_PILLS = {
	Subbed: {label: 'Subbed', tone: css.subbed},
	Dubbed: {label: 'Dubbed', tone: css.dubbed},
	SubbedAndDubbed: {label: 'Subbed/Dubbed', tone: css.dual}
};

// Whether there is anything to show for the given marker and audio.
export const hasAnimeMarkerPills = (marker, audio) => Boolean(
	(marker?.kind && KIND_PILLS[marker.kind]) ||
	marker?.recap === true ||
	AUDIO_PILLS[audio || marker?.audio]
);

// The pills for one episode, season or movie.
const AnimeMarkerPills = ({marker, audio, compact, large, max, className = ''}) => {
	const kind = marker?.kind ? KIND_PILLS[marker.kind] : null;
	const recap = marker?.recap === true;
	const audioKind = audio || marker?.audio;
	const audioPill = audioKind ? AUDIO_PILLS[audioKind] : null;
	const pills = [];
	if (kind) pills.push({key: 'kind', label: kind.label, tone: kind.tone});
	if (recap) pills.push({key: 'recap', label: 'Recap', tone: css.recap});
	if (audioPill) pills.push({key: 'audio', label: audioPill.label, tone: audioPill.tone});

	const shown = max > 0 ? pills.slice(0, max) : pills;
	if (shown.length === 0) return null;

	const size = compact ? css.compact : (large ? css.large : '');
	const rowClass = `${css.row} ${size} ${className}`.trim();

	return (
		<span className={rowClass}>
			{shown.map(p => <span key={p.key} className={`${css.pill} ${p.tone}`}>{$L(p.label)}</span>)}
		</span>
	);
};

export default AnimeMarkerPills;
