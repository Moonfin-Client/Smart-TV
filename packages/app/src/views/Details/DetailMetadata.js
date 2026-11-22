import $L from '@enact/i18n/$L';

import css from './Details.module.less';

// Genres, director, writers and studio, shown only for the ones the item actually has and
// the viewer left on.
const DetailMetadata = ({item, showsCrew = true, showsStudios = true}) => {
	const genres = item.Genres || [];
	const isEpisode = item.Type === 'Episode';
	const directors = showsCrew ? item.People?.filter(p => p.Type === 'Director') || [] : [];
	const writers = showsCrew ? item.People?.filter(p => p.Type === 'Writer') || [] : [];
	const studios = showsStudios ? item.Studios || [] : [];

	const metaItems = [];
	if (genres.length > 0) metaItems.push({label: $L('Genres'), value: genres.slice(0, 3).join(', ')});
	if (directors.length > 0) metaItems.push({label: isEpisode ? $L('Episode Director') : $L('Director'), value: directors.map(d => d.Name).join(', ')});
	if (writers.length > 0) metaItems.push({label: isEpisode ? $L('Episode Writer') : $L('WRITERS'), value: writers.map(w => w.Name).join(', ')});
	if (studios.length > 0) metaItems.push({label: $L('Studio'), value: studios.map(s => s.Name).join(', ')});
	if (metaItems.length === 0) return null;

	return (
		<div className={css.metadataGroup}>
			{metaItems.map((meta, i) => (
				<div key={i} className={css.metadataCell}>
					<span className={css.metadataLabel}>{meta.label}</span>
					<span className={css.metadataValue}>{meta.value}</span>
				</div>
			))}
		</div>
	);
};

export default DetailMetadata;
