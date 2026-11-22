/** Types shared by the extension UI. Kept local now that `packages/` is gone. */
import type { MessageKey } from './i18n';

export interface SearchEngine {
  id: string;
  name: string;
  url: string;
  /**
   * `_locales` key for a built-in engine's label. User-added engines only carry
   * the literal `name` they typed, which is never translated.
   */
  labelKey?: MessageKey;
}

export type CardOpacity = 'clear' | 'medium' | 'solid';

export interface Settings {
  backgroundImage: string | null;
  /** Id of the built-in background from `BACKGROUND_PRESETS`. */
  backgroundPreset: string;
  newTabBookmarkSize: 'small' | 'medium' | 'large';
  /** How much of the page background shows through cards and folder panels. */
  cardOpacity: CardOpacity;
  searchEnabled: boolean;
  searchEngine: string;
  customSearchEngines: SearchEngine[];
}

export interface User {
  id: number;
  email: string;
  role?: 'user' | 'admin';
  created_at?: number;
}

/** Shape returned by `browser.bookmarks.getTree()` (Chrome/Firefox compatible). */
export interface BrowserBookmarkNode {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  dateAdded?: number;
  dateGroupModified?: number;
  index?: number;
  children?: BrowserBookmarkNode[];
  unmodifiable?: string;
  /** Chrome 134+: authoritative marker for the special root folders. */
  folderType?: 'bookmarks-bar' | 'other' | 'mobile' | 'managed';
}

/** A native folder plus everything directly inside it. */
export interface BookmarkGroup {
  /** The folder itself, e.g. for editing. */
  folder: BrowserBookmarkNode;
  /** Path relative to the root folder, e.g. "技术>React". */
  title: string;
  /** Direct children, folders and links alike; nested folders are their own groups. */
  nodes: BrowserBookmarkNode[];
  /**
   * Folders between the root folder and this one, outermost first. Used to hide
   * the whole subtree while an ancestor is collapsed.
   */
  ancestorIds: string[];
}

export interface DeviceInfo {
  id: string;
  browser: string;
  version: string;
  platform: string;
}
