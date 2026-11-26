// Roboto's ascent and descent as shares of its size, for text placed by its baseline.
export const ASCENT = 0.93
export const DESCENT = 0.24

// Invisible formatting characters (bidi marks, zero width spaces, soft hyphens, a BOM). A browser
// draws none of them, and a Roku Label draws each as a missing glyph box.
const INVISIBLE = /[\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g
export const visibleText = (s) => String(s).replace(INVISIBLE, '')

// Superscript and modifier letters (the "ᴴᴰ" in IPTV channel names) as their plain letters, as
// Unicode's compatibility form gives them (a small capital as its lowercase letter), since Roku's
// Roboto has none of them and no fallback font.
const SMALL_FROM = '\u02b0\u02b2\u02b3\u02b7\u02b8\u1d2c\u1d2d\u1d2e\u1d30\u1d31\u1d32\u1d33\u1d34\u1d35\u1d36\u1d37\u1d38\u1d39\u1d3a\u1d3c\u1d3d\u1d3e\u1d3f\u1d40\u1d41\u1d42\u1d43\u1d47\u1d48\u1d49\u1d4d\u1d4f\u1d50\u1d51\u1d52\u1d56\u1d57\u1d58\u1d5b\u1d62\u1d63\u1d64\u1d65\u1d9c\u1d9e\u1da0\u1da6\u1dab\u1db0\u1db5\u1db8\u1dbb\u2070\u2071\u2074\u2075\u2076\u2077\u2078\u2079\u207a\u207c\u207d\u207e\u207f\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089\u208a\u208c\u208d\u208e\u2090\u2091\u2092\u2093\u2095\u2096\u2097\u2098\u2099\u209a\u209b\u209c'
const SMALL_TO = 'hjrwyAÆBDEƎGHIJKLMNOȢPRTUWabdegkmŋoptuviruvcðfilnƫuz0i456789+=()n0123456789+=()aeoxhklmnpst'
const SMALL = new RegExp('[' + SMALL_FROM + ']', 'g')
const plain = (ch) => SMALL_TO[SMALL_FROM.indexOf(ch)]
export const drawableText = (s) => visibleText(s).replace(SMALL, plain)
