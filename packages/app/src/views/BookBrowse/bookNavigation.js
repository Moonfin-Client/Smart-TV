// Where a card in the book library goes. A series with no folder of its own is looked for by name,
// a genre opens the titles in it, and a folder, a folder series among them, opens in folder view.
// Everything else, a collection included, opens its details.
export const openBookItem = (item, {onSelectItem, onOpenGrid}) => {
	if (item.Type === 'Genre') onOpenGrid({genre: item.Name});
	else if (item.Type !== 'BoxSet' && (item.IsFolder || item.Type === 'Folder' || item.Type === 'CollectionFolder')) onOpenGrid({folder: item});
	else onSelectItem(item);
};

// The read button: a book opens in its reader and an audiobook plays from where it was left.
export const readOrListen = (item, onPlay) => onPlay(item, true);

// A series or a genre has nothing for the item menu to act on.
export const bookMenuItem = (item) => (item && item.Type !== 'BookSeries' && item.Type !== 'Genre' ? item : null);
