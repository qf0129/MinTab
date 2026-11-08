import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { getBookmarkTree } from '../lib/browser-bookmarks';
import type { BrowserBookmarkNode } from '../lib/types';

/** Bookmark events arrive per item; a bulk import can fire hundreds at once. */
const REFRESH_DEBOUNCE_MS = 250;

/**
 * Reads the native bookmark tree and keeps it in sync with any change made in
 * the browser (or by this page). New tabs always start from a fresh read.
 *
 * The tree read is debounced: importing a folder used to trigger one full
 * `bookmarks.getTree()` (and one render) per imported item. It can also be
 * paused, which matters while restoring a snapshot: every created bookmark fires
 * `onCreated`, and re-reading/re-rendering thousands of times would freeze the
 * page.
 */
export function useBrowserBookmarks() {
  const [tree, setTree] = useState<BrowserBookmarkNode[]>([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | null>(null);
  const paused = useRef(false);

  const refresh = useCallback(async () => {
    const next = await getBookmarkTree();
    setTree(next);
    setLoading(false);
  }, []);

  const pause = useCallback(() => {
    paused.current = true;
  }, []);

  const resume = useCallback(() => {
    paused.current = false;
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const schedule = () => {
      if (paused.current) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (paused.current) return;
        void refresh();
      }, REFRESH_DEBOUNCE_MS);
    };
    browser.bookmarks.onCreated.addListener(schedule);
    browser.bookmarks.onChanged.addListener(schedule);
    browser.bookmarks.onRemoved.addListener(schedule);
    browser.bookmarks.onMoved.addListener(schedule);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      browser.bookmarks.onCreated.removeListener(schedule);
      browser.bookmarks.onChanged.removeListener(schedule);
      browser.bookmarks.onRemoved.removeListener(schedule);
      browser.bookmarks.onMoved.removeListener(schedule);
    };
  }, [refresh]);

  return { tree, loading, refresh, pause, resume };
}
