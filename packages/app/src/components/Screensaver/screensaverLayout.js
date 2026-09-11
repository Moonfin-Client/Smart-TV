const MOVEMENT_SPEED = {staticCorner: 0, slow: 0.45, moderate: 0.70, fast: 1.0, ultra: 1.60};
const SIZE_SCALE = {thumbnail: 0.45, small: 0.70, medium: 1.0, large: 1.5};
const POSITION_CLASS = {
	topLeft: 'anchorTopLeft',
	topCenter: 'anchorTopCenter',
	topRight: 'anchorTopRight',
	middleLeft: 'anchorMiddleLeft',
	middle: 'anchorMiddle',
	middleRight: 'anchorMiddleRight',
	bottomLeft: 'anchorBottomLeft',
	bottomCenter: 'anchorBottomCenter',
	bottomRight: 'anchorBottomRight'
};

const SPEED = 30;
const FRAME_DELAY = 16;

// Turns the saved choices into everything a screensaver needs to place its
// component. The box sizes come from the caller because the preview draws the
// same arrangement at a fraction of the size.
export const resolveLayout = ({component, movement, position, size, sizes}) => {
	const scale = SIZE_SCALE[size] ?? SIZE_SCALE.medium;
	const speedMultiplier = MOVEMENT_SPEED[movement] ?? MOVEMENT_SPEED.moderate;
	const box = sizes[component] || null;

	return {
		scale,
		speedMultiplier,
		bounces: speedMultiplier > 0,
		box,
		boxStyle: box ? {width: Math.round(box.width * scale) + 'px', height: Math.round(box.height * scale) + 'px'} : null,
		anchorClass: POSITION_CLASS[position] || POSITION_CLASS.middle
	};
};

// Drifts a box around its bounds and turns it at the walls, at the pace the
// movement setting asks for.
export const startBounce = ({boxRef, animRef, facingRef, bounds, width, height, speedMultiplier, margin}) => {
	const maxX = bounds.width - width - margin;
	const maxY = bounds.height - height - margin;
	if (maxX <= margin || maxY <= margin) return;

	let x = margin + (Math.random() * (maxX - margin));
	let y = margin + (Math.random() * (maxY - margin));
	let dx = Math.random() > 0.5 ? 1 : -1;
	let dy = Math.random() > 0.5 ? 1 : -1;
	let last = Date.now();
	let running = true;

	const place = () => {
		if (!boxRef.current) return;
		boxRef.current.style.transform = 'translate(' + Math.round(x) + 'px, ' + Math.round(y) + 'px)';
		boxRef.current.style.webkitTransform = boxRef.current.style.transform;
	};

	const animate = () => {
		if (!running) return;

		const now = Date.now();
		const dt = (now - last) / 1000;
		last = now;

		// A gap this wide means the app was away, and carrying all of it forward
		// would throw the box across the screen in one step.
		if (dt > 0 && dt <= 1) {
			x += dx * SPEED * speedMultiplier * dt;
			y += dy * SPEED * speedMultiplier * dt;

			if (x <= margin) {
				x = margin;
				dx = 1;
			} else if (x >= maxX) {
				x = maxX;
				dx = -1;
			}
			if (y <= margin) {
				y = margin;
				dy = 1;
			} else if (y >= maxY) {
				y = maxY;
				dy = -1;
			}

			facingRef.current = dx < 0;
			place();
		}

		animRef.current = window.requestAnimationFrame ? window.requestAnimationFrame(animate) : setTimeout(animate, FRAME_DELAY);
	};

	facingRef.current = dx < 0;
	place();
	animate();

	return () => {
		running = false;
		if (animRef.current == null) return;
		if (window.requestAnimationFrame) {
			window.cancelAnimationFrame(animRef.current);
		} else {
			clearTimeout(animRef.current);
		}
	};
};
