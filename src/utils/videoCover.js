// TVs draw video on a plane sized to the element's box and ignore object-fit and
// transforms on it, so a fitted video is sized through the element itself. This puts
// the shared element back to filling whatever holds it next.
export const resetVideoBox = (video) => {
	if (!video) return;
	video.style.width = '100%';
	video.style.height = '100%';
	video.style.left = '0';
	video.style.top = '0';
};
