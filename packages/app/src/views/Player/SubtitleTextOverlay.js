/* eslint-disable react/no-danger */
import {languageTag} from '../../utils/audioLanguage';
import {getSubtitleOverlayStyle, getSubtitleTextStyle, sanitizeSubtitleHtml} from '../../utils/subtitleConstants';
import {DEFAULT_SECONDARY_OFFSET, secondaryTextStyle} from './secondarySubtitle';

// A subtitle font from the settings is set inline, which outranks the stylesheet's Japanese
// face, so a Japanese line names that face ahead of it here. It only covers kana and kanji.
export const languageStyle = (style, lang) =>
	lang === 'ja' && style.fontFamily ? {...style, fontFamily: `'NotoSansJP', ${style.fontFamily}`} : style;

// The second track stacks right above the first in one column, so the two never overlap
// however many lines either has. While it's loaded, its vertical offset moves the pair.
const SubtitleTextOverlay = ({css, settings, primaryText, secondaryText, secondaryLoaded, primaryLanguage, secondaryLanguage}) => {
	if (!primaryText && !secondaryText) return null;

	const textStyle = getSubtitleTextStyle(settings);
	const primaryLang = languageTag(primaryLanguage);
	const secondaryLang = languageTag(secondaryLanguage);
	const shift = secondaryLoaded ? settings.secondarySubtitleOffset - DEFAULT_SECONDARY_OFFSET : 0;

	return (
		<div
			className={css.subtitleOverlay}
			style={{...getSubtitleOverlayStyle(settings, shift), flexDirection: 'column', alignItems: 'center'}}
		>
			{secondaryText && (
				<div
					lang={secondaryLang}
					className={css.subtitleText}
					style={languageStyle(secondaryTextStyle(settings, textStyle), secondaryLang)}
					dangerouslySetInnerHTML={{__html: sanitizeSubtitleHtml(secondaryText)}}
				/>
			)}
			{primaryText && (
				<div
					lang={primaryLang}
					className={css.subtitleText}
					style={languageStyle(textStyle, primaryLang)}
					dangerouslySetInnerHTML={{__html: sanitizeSubtitleHtml(primaryText)}}
				/>
			)}
		</div>
	);
};

export default SubtitleTextOverlay;
