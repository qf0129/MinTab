import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  buildBookmarkHtml,
  collectUrls,
  countLocalLinks,
  countNodes,
  normalizeUrl,
  rootKindOf,
  rootKindOfNode,
  snapshotChildren,
} from '../lib/bookmark-transfer';
import type { BrowserBookmarkNode } from '../lib/types';

const localTree: BrowserBookmarkNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: '书签栏',
        dateAdded: 1_700_000_000_000,
        dateGroupModified: 1_700_000_100_000,
        children: [
          {
            id: '2',
            title: '技术',
            dateAdded: 1_700_000_000_000,
            children: [
              { id: '3', title: 'React', url: 'https://react.dev', dateAdded: 1_700_000_000_000 },
            ],
          },
          { id: '4', title: 'A & B <script>', url: 'https://example.com/?a=1&b="2"' },
        ],
      },
      { id: '5', title: '其他书签', children: [] },
    ],
  },
];

describe('normalizeUrl', () => {
  it('drops the hash and a trailing slash, lowercases the host', () => {
    expect(normalizeUrl('https://Example.com/Path/?a=1#frag')).toBe('https://example.com/Path?a=1');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
    expect(normalizeUrl('http://example.com:8080/x/')).toBe('http://example.com:8080/x');
  });

  it('keeps unparsable values as-is', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('tree helpers', () => {
  it('unwraps the synthetic root', () => {
    expect(snapshotChildren([{ title: '', children: [{ title: '书签栏' }] }])).toEqual([
      { title: '书签栏' },
    ]);
  });

  it('counts every node including folders', () => {
    expect(countNodes([{ title: 'a' }, { title: 'f', children: [{ title: 'b' }] }])).toBe(3);
  });

  it('collects normalised, de-duplicated link urls', () => {
    expect(collectUrls(localTree).size).toBe(2);
    expect(countLocalLinks(localTree)).toBe(2);
  });
});

describe('rootKindOf', () => {
  it('maps localised root folder names', () => {
    expect(rootKindOf('书签栏')).toBe('bar');
    expect(rootKindOf('Bookmarks bar')).toBe('bar');
    // Edge calls the same folders 收藏夹栏 / 其他收藏夹.
    expect(rootKindOf('收藏夹栏')).toBe('bar');
    expect(rootKindOf('其他书签')).toBe('other');
    expect(rootKindOf('Other bookmarks')).toBe('other');
    expect(rootKindOf('其他收藏夹')).toBe('other');
    expect(rootKindOf('移动设备书签')).toBe('mobile');
    expect(rootKindOf('Mobile bookmarks')).toBe('mobile');
    expect(rootKindOf('移动收藏夹')).toBe('mobile');
    expect(rootKindOf('技术')).toBeNull();
  });
});

describe('rootKindOfNode', () => {
  it('prefers folderType over the localised title', () => {
    // A German/Japanese/Edge title is unrecognised, but folderType is not.
    expect(rootKindOfNode({ folderType: 'bookmarks-bar', title: 'Lesezeichenleiste' })).toBe('bar');
    expect(rootKindOfNode({ folderType: 'other', title: '随便什么' })).toBe('other');
    expect(rootKindOfNode({ folderType: 'mobile', title: '' })).toBe('mobile');
  });

  it('ignores policy-managed folders even when the title looks like the bar', () => {
    expect(rootKindOfNode({ folderType: 'managed', title: '书签栏' })).toBeNull();
  });

  it('falls back to the title when folderType is absent', () => {
    expect(rootKindOfNode({ title: '收藏夹栏' })).toBe('bar');
    expect(rootKindOfNode({})).toBeNull();
  });
});

describe('buildBookmarkHtml', () => {
  const html = buildBookmarkHtml(localTree);

  it('starts with the Netscape doctype and opens the root list', () => {
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html).toContain('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  });

  it('writes folders and links with the attributes browsers emit', () => {
    expect(html).toContain(
      '<DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000100" PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>'
    );
    expect(html).toContain('<DT><H3 ADD_DATE="1700000000">技术</H3>');
    expect(html).toContain('<DT><A HREF="https://react.dev" ADD_DATE="1700000000">React</A>');
  });

  it('marks only the top-level bookmark bar, not a nested folder with that name', () => {
    expect(html.match(/PERSONAL_TOOLBAR_FOLDER/g)?.length).toBe(1);

    const nested: BrowserBookmarkNode[] = [
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: '其他书签',
            children: [{ id: '2', title: '书签栏', children: [] }],
          },
        ],
      },
    ];
    const nestedHtml = buildBookmarkHtml(nested);
    expect(nestedHtml).not.toContain('PERSONAL_TOOLBAR_FOLDER');
    expect(nestedHtml).toContain('<DT><H3>书签栏</H3>');
  });

  it('escapes titles and urls', () => {
    expect(html).toContain('A &amp; B &lt;script&gt;');
    expect(html).toContain('HREF="https://example.com/?a=1&amp;b=&quot;2&quot;"');
  });

  it('closes every folder it opens', () => {
    // 书签栏 / 技术 / 其他书签 plus the document-level list.
    expect(html.match(/<DL><p>/g)?.length).toBe(4);
    expect(html.match(/<\/DL><p>/g)?.length).toBe(4);
  });
});

describe('backupFileName', () => {
  it('is ascii and timestamped', () => {
    expect(backupFileName()).toMatch(/^mintab-local-backup-\d{8}-\d{6}\.html$/);
    expect(backupFileName('before-overwrite')).toMatch(/^before-overwrite-\d{8}-\d{6}\.html$/);
  });
});
