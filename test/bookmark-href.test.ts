import { describe, expect, it } from 'vitest';
import { bookmarkHref } from '../lib/browser-bookmarks';
import type { BrowserBookmarkNode } from '../lib/types';

function link(url?: string): BrowserBookmarkNode {
  return { id: 'x', title: 't', url };
}

describe('bookmarkHref', () => {
  it('returns a normalised href for web URLs', () => {
    expect(bookmarkHref(link('https://react.dev'))).toBe('https://react.dev/');
    expect(bookmarkHref(link('http://example.com/a?b=1'))).toBe('http://example.com/a?b=1');
    expect(bookmarkHref(link('ftp://files.example.com/x'))).toBe('ftp://files.example.com/x');
  });

  it('refuses privileged, script and malformed URLs', () => {
    expect(bookmarkHref(link('javascript:alert(1)'))).toBeNull();
    expect(bookmarkHref(link('chrome://settings'))).toBeNull();
    expect(bookmarkHref(link('file:///C:/secret.txt'))).toBeNull();
    expect(bookmarkHref(link('data:text/html,hi'))).toBeNull();
    expect(bookmarkHref(link('not a url'))).toBeNull();
  });

  it('returns null for folders and URL-less nodes', () => {
    expect(bookmarkHref({ id: 'f', title: '文件夹', children: [] })).toBeNull();
    expect(bookmarkHref(link(undefined))).toBeNull();
  });
});
