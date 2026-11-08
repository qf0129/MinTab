import { isFolder } from '../lib/browser-bookmarks';
import type { BrowserBookmarkNode } from '../lib/types';
import { BookmarkEditDialog } from './BookmarkEditDialog';
import { FolderEditDialog } from './FolderEditDialog';

interface Props {
  node: BrowserBookmarkNode | null;
  onClose: () => void;
  onChanged: () => void;
}

/** Opens the right editor (bookmark vs folder) for the selected node. */
export function BookmarkDialogHost({ node, onClose, onChanged }: Props) {
  if (!node) return null;
  return isFolder(node) ? (
    <FolderEditDialog node={node} onClose={onClose} onChanged={onChanged} />
  ) : (
    <BookmarkEditDialog node={node} onClose={onClose} onChanged={onChanged} />
  );
}
