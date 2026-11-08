import { backupFileName, buildBookmarkHtml } from './bookmark-transfer';
import type { BrowserBookmarkNode } from './types';

/**
 * Download the current local bookmarks as a Netscape HTML file.
 *
 * Call this **synchronously from a click handler** and before any `await`: once
 * the user gesture is gone the browser may silently block the download, which
 * would leave the user believing a backup exists when it does not.
 *
 * Returns the filename that was handed to the browser.
 */
export function downloadLocalBackup(tree: BrowserBookmarkNode[], prefix?: string): string {
  const name = backupFileName(prefix);
  const blob = new Blob([buildBookmarkHtml(tree)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return name;
}
