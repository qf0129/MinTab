import { browser } from 'wxt/browser';
import type { BookmarkGroup, BrowserBookmarkNode } from './types';

/** Read the full native bookmark tree (fresh on every new tab open). */
export async function getBookmarkTree(): Promise<BrowserBookmarkNode[]> {
  return (await browser.bookmarks.getTree()) as unknown as BrowserBookmarkNode[];
}

export function isFolder(node: BrowserBookmarkNode): boolean {
  return Array.isArray(node.children);
}

/** Top-level folders: 书签栏 / 其他书签 / 移动设备书签 … */
export function rootFolders(tree: BrowserBookmarkNode[]): BrowserBookmarkNode[] {
  return (tree[0]?.children ?? []).filter(isFolder);
}

function titleOf(node: BrowserBookmarkNode): string {
  return node.title || '未命名';
}

/** Count bookmark links inside a folder, recursively. */
export function countBookmarks(node: BrowserBookmarkNode): number {
  if (!isFolder(node)) return 1;
  return (node.children ?? []).reduce((total, child) => total + countBookmarks(child), 0);
}

/** Separator used in flat group titles: "技术>React". */
export const FOLDER_PATH_SEPARATOR = ' / ';

/**
 * Every folder below `root`, in depth-first order. Each group is titled with its
 * path relative to `root` and carries the folder's direct children.
 */
export function subfolderGroups(root: BrowserBookmarkNode): BookmarkGroup[] {
  const groups: BookmarkGroup[] = [];
  const walk = (folder: BrowserBookmarkNode, path: string[], ancestorIds: string[]): void => {
    groups.push({
      folder,
      title: path.join(FOLDER_PATH_SEPARATOR),
      nodes: folder.children ?? [],
      ancestorIds,
    });
    for (const child of folder.children ?? []) {
      if (isFolder(child)) {
        walk(child, [...path, titleOf(child)], [...ancestorIds, folder.id]);
      }
    }
  };
  for (const child of root.children ?? []) {
    if (isFolder(child)) walk(child, [titleOf(child)], []);
  }
  return groups;
}

/**
 * Drop every group below a collapsed folder. The collapsed folder's own group
 * stays, because its header is what expands it again; nested groups are
 * rendered as siblings, so the whole subtree has to be filtered out explicitly.
 */
export function visibleGroups(
  groups: BookmarkGroup[],
  collapsed: ReadonlySet<string>
): BookmarkGroup[] {
  return groups.filter((group) => !group.ancestorIds.some((id) => collapsed.has(id)));
}

export async function updateBookmarkNode(
  id: string,
  changes: { title?: string; url?: string }
): Promise<void> {
  await browser.bookmarks.update(id, changes);
}

export async function renameFolderNode(id: string, title: string): Promise<void> {
  await browser.bookmarks.update(id, { title });
}

/**
 * Persist a reorder inside the node's current parent.
 *
 * `newIndex` comes from SortableJS's `onUpdate`, i.e. the index the node ends up
 * at once it has been removed from its old slot (`arrayMove` semantics).
 */
export async function moveBookmarkNode(
  id: string,
  oldIndex: number,
  newIndex: number
): Promise<void> {
  // Chrome (and Edge) resolve `index` against the child list as it looks
  // *before* the node is removed, so moving downwards needs a +1 correction.
  // Firefox wants the final index as-is. Leaving `parentId` out keeps the node
  // in the folder it currently lives in.
  const index = newIndex > oldIndex && !import.meta.env.FIREFOX ? newIndex + 1 : newIndex;
  await browser.bookmarks.move(id, { index });
}

export async function removeBookmarkNode(id: string): Promise<void> {
  await browser.bookmarks.remove(id);
}

export async function removeFolderNode(id: string): Promise<void> {
  await browser.bookmarks.removeTree(id);
}
