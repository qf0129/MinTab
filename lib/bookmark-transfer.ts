import { PRODUCT_NAME } from './constants';
import type { BrowserBookmarkNode } from './types';

/**
 * A node from a cloud snapshot. Ids and parentIds in there belong to whichever
 * browser produced the upload, so only `title` / `url` / `children` are used.
 */
export interface SnapshotNode {
  title?: unknown;
  url?: unknown;
  children?: SnapshotNode[];
  /** Chrome 134+: present on the special root folders, survives JSON storage. */
  folderType?: unknown;
}

/** Normalise a URL for de-duplication when merging snapshots. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${path}${url.search}`;
  } catch {
    return trimmed;
  }
}

/** The folder list of a snapshot: unwraps the synthetic root node. */
export function snapshotChildren(snapshot: SnapshotNode[]): SnapshotNode[] {
  const root = snapshot[0];
  return Array.isArray(root?.children) ? root.children : snapshot;
}

export function countNodes(nodes: SnapshotNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1;
    if (Array.isArray(node.children)) total += countNodes(node.children);
  }
  return total;
}

/** URLs already in the local browser, used to skip duplicates when merging. */
export function collectUrls(tree: BrowserBookmarkNode[]): Set<string> {
  const urls = new Set<string>();
  const walk = (nodes: BrowserBookmarkNode[]): void => {
    for (const node of nodes) {
      if (typeof node.url === 'string' && node.url) urls.add(normalizeUrl(node.url));
      if (Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(tree);
  return urls;
}

/** Number of bookmark links (not folders) in the local tree. */
export function countLocalLinks(tree: BrowserBookmarkNode[]): number {
  let total = 0;
  const walk = (nodes: BrowserBookmarkNode[]): void => {
    for (const node of nodes) {
      if (typeof node.url === 'string' && node.url) total += 1;
      if (Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(tree);
  return total;
}

export type RootKind = 'bar' | 'other' | 'mobile';

/**
 * The authoritative, locale-independent marker for browser root folders.
 * Chrome 134+ / Edge expose `folderType` on `BookmarkTreeNode`.
 */
const FOLDER_TYPE_KIND: Record<string, RootKind | null> = {
  'bookmarks-bar': 'bar',
  other: 'other',
  mobile: 'mobile',
  // Policy-managed folders are not ours to replace.
  managed: null,
};

/** Prefer `folderType`, fall back to the (localised) title. */
export function rootKindOfNode(node: { title?: unknown; folderType?: unknown }): RootKind | null {
  if (typeof node.folderType === 'string' && node.folderType in FOLDER_TYPE_KIND) {
    return FOLDER_TYPE_KIND[node.folderType] ?? null;
  }
  return rootKindOf(typeof node.title === 'string' ? node.title : '');
}

/**
 * Which special root folder a title refers to.
 *
 * Locales and browsers disagree on the names: Chrome/Edge/Firefox each ship their
 * own wording ("书签栏" vs Edge's "收藏夹栏" vs "Bookmarks bar"), so every known
 * variant is listed here. A root that is not recognised must never silently
 * disappear into another root - see the fallback in `restore-core`.
 */
export function rootKindOf(title: string): RootKind | null {
  const value = title.trim().replace(/\s+/g, ' ').toLowerCase();
  if (
    /书签栏|书签工具栏|个人书签栏|收藏夹栏|收藏栏|bookmarks bar|bookmarks toolbar|favorites bar|favourites bar/.test(
      value
    )
  ) {
    return 'bar';
  }
  if (
    /其他书签|未整理书签|其他收藏夹|other bookmarks|unsorted bookmarks|other favorites|other favourites/.test(
      value
    )
  ) {
    return 'other';
  }
  if (/移动设备书签|移动收藏夹|mobile bookmarks|mobile favorites|mobile favourites/.test(value)) {
    return 'mobile';
  }
  return null;
}

const HTML_HEADER = [
  '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
  '<!-- This is an automatically generated file.',
  '     It will be read and overwritten.',
  '     DO NOT EDIT! -->',
  '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
  `<TITLE>${PRODUCT_NAME} Bookmarks</TITLE>`,
  `<H1>${PRODUCT_NAME} Bookmarks</H1>`,
  '<DL><p>',
].join('\n');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addDate(node: BrowserBookmarkNode): string {
  return typeof node.dateAdded === 'number'
    ? ` ADD_DATE="${Math.floor(node.dateAdded / 1000)}"`
    : '';
}

/**
 * Folder attributes as Chrome and Firefox write them.
 *
 * `PERSONAL_TOOLBAR_FOLDER="true"` is what makes the exporter's bookmark bar a
 * bookmark bar again on import instead of an ordinary folder.
 */
function addFolderAttrs(node: BrowserBookmarkNode, depth: number): string {
  let attrs = addDate(node);
  if (typeof node.dateGroupModified === 'number') {
    attrs += ` LAST_MODIFIED="${Math.floor(node.dateGroupModified / 1000)}"`;
  }
  if (depth === 1 && rootKindOfNode(node) === 'bar') {
    attrs += ' PERSONAL_TOOLBAR_FOLDER="true"';
  }
  return attrs;
}

function renderNodes(nodes: BrowserBookmarkNode[], depth: number): string {
  const indent = '    '.repeat(depth);
  let html = '';
  for (const node of nodes) {
    if (Array.isArray(node.children)) {
      html += `${indent}<DT><H3${addFolderAttrs(node, depth)}>${escapeHtml(
        node.title || '未命名文件夹'
      )}</H3>\n`;
      html += `${indent}<DL><p>\n`;
      html += renderNodes(node.children, depth + 1);
      html += `${indent}</DL><p>\n`;
      continue;
    }
    if (typeof node.url === 'string' && node.url) {
      html += `${indent}<DT><A HREF="${escapeHtml(node.url)}"${addDate(node)}>${escapeHtml(
        node.title || node.url
      )}</A>\n`;
    }
  }
  return html;
}

/**
 * Netscape bookmark file, the format every browser's "导入书签" understands.
 * The hierarchy is preserved so the file can really rebuild the bookmark bar.
 */
export function buildBookmarkHtml(tree: BrowserBookmarkNode[]): string {
  const nodes = tree[0]?.children ?? tree;
  return `${HTML_HEADER}\n${renderNodes(nodes, 1)}</DL><p>\n`;
}

/** ASCII, sortable, Windows-safe filename. */
export function backupFileName(prefix = 'mintab-local-backup'): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  return `${prefix}-${stamp}.html`;
}
