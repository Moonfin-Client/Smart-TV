import {useSettings} from '../../context/SettingsContext';
import {rootScale} from '../../utils/rootScale';
import LibrarySkeleton from '../Library/LibrarySkeleton';
import BookCategoryScreen from './BookCategoryScreen';
import ClassicBooks from './ClassicBooks';
import ReadingRoomBooks from './ReadingRoomBooks';
import useBookLibrary from './useBookLibrary';

import css from '../MusicBrowse/MusicScreens.module.less';

const STYLES = ['bookstore', 'classic', 'readingRoom'];

// The book library in the style picked in Settings, swapped as soon as the setting changes. The
// styles share one read of the library, and `screen` names the destination open over it, which
// `onOpenScreen` switches in place. Null is Classic's or Reading Room's overview, or Bookstore's
// All Titles.
const BookBrowse = ({screen, onOpenScreen, ...props}) => {
	const {settings} = useSettings();
	const style = STYLES.includes(settings.bookLibraryStyle) ? settings.bookLibraryStyle : 'bookstore';
	const data = useBookLibrary({api: props.api, library: props.library});

	if (data.loading) {
		return (
			<div className={css.page}>
				<LibrarySkeleton gridWidth={window.innerWidth / rootScale() - 174} cardWidth={267} posterHeight={400} padX={16} minRowGap={20} showText />
			</div>
		);
	}

	let overview = null;
	if (style === 'classic') overview = <ClassicBooks {...props} data={data} onOpenScreen={onOpenScreen} />;
	else if (style === 'readingRoom') overview = <ReadingRoomBooks {...props} data={data} onOpenScreen={onOpenScreen} />;

	return (
		<BookCategoryScreen
			{...props}
			style={style}
			screen={screen}
			data={data}
			showDiscover={settings.showBookDiscoverTab !== false}
			overview={overview}
			onOpenScreen={onOpenScreen}
		/>
	);
};

export default BookBrowse;
