import {useState, useEffect, useCallback} from 'react';
import * as jellyfinApi from '../../services/jellyfinApi';

import css from './TrickplayPreview.module.less';

export const getTrickplayManifest = async (itemId, mediaSourceId) => {
	try {
		const serverUrl = jellyfinApi.getServerUrl();
		const apiKey = jellyfinApi.getApiKey();

		const response = await fetch(
			`${serverUrl}/Videos/${itemId}/${mediaSourceId}/Trickplay`,
			{headers: {'X-Emby-Token': apiKey}}
		);

		if (!response.ok) return null;

		const data = await response.json();
		return data;
	} catch {
		return null;
	}
};

const calculateSpritePosition = (positionTicks, manifest, selectedWidth) => {
	if (!manifest || !selectedWidth) return null;

	const trickplayInfo = manifest[selectedWidth];
	if (!trickplayInfo) return null;

	const {
		TileWidth,
		TileHeight,
		Width,
		Height,
		Interval,
		ThumbnailCount
	} = trickplayInfo;

	const positionMs = positionTicks / 10000;
	const thumbnailIndex = Math.floor(positionMs / Interval);

	if (thumbnailIndex < 0 || thumbnailIndex >= ThumbnailCount) {
		return null;
	}

	const tilesPerRow = Math.floor(Width / TileWidth);
	const tilesPerCol = Math.floor(Height / TileHeight);
	const tilesPerImage = tilesPerRow * tilesPerCol;

	const imageIndex = Math.floor(thumbnailIndex / tilesPerImage);
	const indexInImage = thumbnailIndex % tilesPerImage;

	const row = Math.floor(indexInImage / tilesPerRow);
	const col = indexInImage % tilesPerRow;

	return {
		imageIndex,
		x: col * TileWidth,
		y: row * TileHeight,
		width: TileWidth,
		height: TileHeight,
		spriteWidth: Width,
		spriteHeight: Height
	};
};

const TrickplayPreview = ({
	itemId,
	mediaSourceId,
	positionTicks,
	visible = false,
	preferredWidth = 320
}) => {
	const [manifest, setManifest] = useState(null);
	const [selectedWidth, setSelectedWidth] = useState(null);
	const [currentImage, setCurrentImage] = useState(null);
	const [position, setPosition] = useState(null);

	useEffect(() => {
		const loadManifest = async () => {
			if (!itemId || !mediaSourceId) return;

			const data = await getTrickplayManifest(itemId, mediaSourceId);
			if (data) {
				setManifest(data);

				const widths = Object.keys(data).map(Number).sort((a, b) => a - b);
				let best = widths[0];
				for (const w of widths) {
					if (w <= preferredWidth) best = w;
				}
				setSelectedWidth(best);
			}
		};

		loadManifest();
	}, [itemId, mediaSourceId, preferredWidth]);

	useEffect(() => {
		if (!manifest || !selectedWidth || !visible) return;

		const newPosition = calculateSpritePosition(positionTicks, manifest, selectedWidth);
		if (newPosition) {
			setPosition(newPosition);

			const serverUrl = jellyfinApi.getServerUrl();
			const apiKey = jellyfinApi.getApiKey();
			const imageUrl = `${serverUrl}/Videos/${itemId}/${mediaSourceId}/Trickplay/${selectedWidth}/${newPosition.imageIndex}.jpg?api_key=${apiKey}`;
			setCurrentImage(imageUrl);
		}
	}, [positionTicks, manifest, selectedWidth, visible, itemId, mediaSourceId]);

	const formatTime = useCallback((ticks) => {
		const totalSeconds = Math.floor(ticks / 10000000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
		}
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}, []);

	if (!visible || !currentImage || !position) {
		return null;
	}

	return (
		<div className={css.trickplayPreview}>
			<div
				className={css.thumbnailContainer}
				style={{
					width: position.width,
					height: position.height
				}}
			>
				<div
					className={css.thumbnailSprite}
					style={{
						backgroundImage: `url(${currentImage})`,
						backgroundPosition: `-${position.x}px -${position.y}px`,
						width: position.spriteWidth,
						height: position.spriteHeight
					}}
				/>
			</div>
			<div className={css.timeDisplay}>
				{formatTime(positionTicks)}
			</div>
		</div>
	);
};

export default TrickplayPreview;
