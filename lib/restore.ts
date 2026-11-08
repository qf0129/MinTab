import { browser } from 'wxt/browser';
import * as core from './restore-core';
import type { BrowserBookmarkNode } from './types';

export type { RestoreMode, RestoreProgress, RestoreResult, UndoResult } from './restore-core';

/** Adapter binding the pure restore engine to the real bookmarks API. */
const api: core.BookmarkApi = {
  create: (details) => browser.bookmarks.create(details),
  remove: (id) => browser.bookmarks.remove(id),
  removeTree: (id) => browser.bookmarks.removeTree(id),
  move: (id, destination) => browser.bookmarks.move(id, destination),
  getTree: async () => (await browser.bookmarks.getTree()) as unknown as BrowserBookmarkNode[],
  getSubTree: async (id) =>
    (await browser.bookmarks.getSubTree(id)) as unknown as BrowserBookmarkNode[],
};

export function restoreSnapshot(options: Parameters<typeof core.restoreSnapshot>[0]) {
  return core.restoreSnapshot(options, api);
}

export function undoLastRestore() {
  return core.undoLastRestore(api);
}

export const getUndoInfo = core.getUndoInfo;
