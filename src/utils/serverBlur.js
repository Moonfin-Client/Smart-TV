// Jellyfin and Emby blur artwork on request, so a blurred backdrop costs no more to draw than a plain
// one. The request shrinks by the same factor as the blur, which keeps the radius on screen the same
// and leaves a far smaller image to decode. The servers only take a whole number, and every blur
// option divides evenly by this.
const SHRINK = 5;

// The url asking the server for the blurred image, or null when the artwork isn't the server's own
// and the caller has to blur it some other way.
export const serverBlurredUrl = (url, blur) => {
	if (!(blur > 0) || !/\/Items\/[^/?]+\/Images\//.test(url)) return null;
	const [path, query] = url.split('?');
	const params = (query || '').split('&').filter((param) => param && !/^(maxWidth|maxHeight|blur)=/i.test(param));
	params.push(`maxWidth=${Math.round((window.innerWidth || 1920) / SHRINK)}`, `blur=${Math.max(1, Math.round(blur / SHRINK))}`);
	return `${path}?${params.join('&')}`;
};
