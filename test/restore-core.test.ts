import { beforeEach, describe, expect, it } from 'vitest';
import type { SnapshotNode } from '../lib/bookmark-transfer';
import {
  type BookmarkApi,
  getUndoInfo,
  resetUndoState,
  restoreSnapshot,
  undoLastRestore,
} from '../lib/restore-core';
import type { BrowserBookmarkNode } from '../lib/types';

interface FakeNode extends BrowserBookmarkNode {
  children?: FakeNode[];
}

/**
 * In-memory stand-in for `browser.bookmarks`.
 *
 * Reads return clones, exactly like the real API: the tree React holds on to must
 * not change behind its back, otherwise "undo replace" would rebuild an already
 * wiped tree.
 */
function createFakeBrowser() {
  let nextId = 100;
  const bar: FakeNode = { id: '1', title: '书签栏', children: [] };
  const other: FakeNode = { id: '2', title: '其他书签', children: [] };
  const root: FakeNode = { id: '0', title: '', children: [bar, other] };
  const tree = [root];

  const find = (nodes: FakeNode[], id: string): FakeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const hit = node.children ? find(node.children, id) : null;
      if (hit) return hit;
    }
    return null;
  };

  const detach = (nodes: FakeNode[], id: string): FakeNode | null => {
    const index = nodes.findIndex((node) => node.id === id);
    if (index >= 0) return nodes.splice(index, 1)[0] ?? null;
    for (const node of nodes) {
      if (!node.children) continue;
      const hit = detach(node.children, id);
      if (hit) return hit;
    }
    return null;
  };

  const clone = (nodes: FakeNode[]): BrowserBookmarkNode[] =>
    nodes.map((node) => ({
      id: node.id,
      title: node.title,
      ...(node.url ? { url: node.url } : {}),
      ...(node.folderType ? { folderType: node.folderType } : {}),
      ...(node.unmodifiable ? { unmodifiable: node.unmodifiable } : {}),
      ...(node.children ? { children: clone(node.children) } : {}),
    }));

  const api: BookmarkApi = {
    async create(details) {
      const parent = find(tree, details.parentId);
      if (!parent) throw new Error(`unknown parent ${details.parentId}`);
      if (!parent.children) throw new Error('parent is a bookmark, not a folder');
      const node: FakeNode = {
        id: `n${nextId++}`,
        title: details.title ?? '',
        ...(details.url ? { url: details.url } : { children: [] }),
      };
      parent.children.push(node);
      return { id: node.id };
    },
    async remove(id) {
      const node = find(tree, id);
      if (!node) throw new Error(`unknown node ${id}`);
      if (node.children) throw new Error('node has children');
      detach(tree, id);
    },
    async removeTree(id) {
      if (!detach(tree, id)) throw new Error(`unknown node ${id}`);
    },
    async move(id, destination) {
      const node = detach(tree, id);
      if (!node) throw new Error(`unknown node ${id}`);
      const parent = destination.parentId ? find(tree, destination.parentId) : null;
      if (!parent?.children) throw new Error(`unknown parent ${destination.parentId}`);
      parent.children.push(node);
      return node;
    },
    async getTree() {
      return clone(tree);
    },
    async getSubTree(id) {
      const node = find(tree, id);
      return node ? clone([node]) : [];
    },
  };

  return { api, bar, other, tree, clone };
}

/** A realistic snapshot: `getTree()` output with the synthetic root. */
function snapshotOf(
  roots: { title: string; folderType?: string; children: SnapshotNode[] }[]
): SnapshotNode[] {
  return [
    {
      title: '',
      children: roots.map((root) => ({
        title: root.title,
        ...(root.folderType ? { folderType: root.folderType } : {}),
        children: root.children,
      })),
    },
  ];
}

/** Links currently inside a folder, depth first. */
function linksIn(folder: { children?: FakeNode[] }): string[] {
  const links: string[] = [];
  const walk = (nodes: FakeNode[] = []): void => {
    for (const node of nodes) {
      if (node.url) links.push(node.url);
      if (node.children) walk(node.children);
    }
  };
  walk(folder.children);
  return links;
}

function titlesIn(folder: { children?: FakeNode[] }): string[] {
  return (folder.children ?? []).map((node) => node.title);
}

beforeEach(() => {
  resetUndoState();
});

describe('restoreSnapshot · merge', () => {
  it('merges into the existing 书签栏 instead of nesting the snapshot root', async () => {
    const { api, bar, tree, clone } = createFakeBrowser();
    bar.children = [{ id: 'a', title: 'A', url: 'https://a.example' }];
    const existing = clone(tree);

    const result = await restoreSnapshot(
      {
        mode: 'merge',
        existingTree: existing,
        snapshot: snapshotOf([
          {
            title: '书签栏',
            children: [
              { title: 'A again', url: 'https://a.example/' },
              { title: 'C', url: 'https://c.example' },
              { title: '技术', children: [{ title: 'D', url: 'https://d.example' }] },
            ],
          },
        ]),
      },
      api
    );

    expect(result.skipped).toBe(1);
    expect(titlesIn(bar)).toEqual(['A', 'C', '技术']);
    expect(linksIn(bar)).toEqual(['https://a.example', 'https://c.example', 'https://d.example']);
  });

  it('reuses an existing folder instead of creating a duplicate', async () => {
    const { api, bar, tree, clone } = createFakeBrowser();
    bar.children = [
      {
        id: 't',
        title: '技术',
        children: [{ id: 'd', title: 'D', url: 'https://d.example' }],
      },
    ];
    const existing = clone(tree);

    await restoreSnapshot(
      {
        mode: 'merge',
        existingTree: existing,
        snapshot: snapshotOf([
          {
            title: '书签栏',
            children: [
              {
                title: '技术',
                children: [
                  { title: 'D', url: 'https://d.example' },
                  { title: 'E', url: 'https://e.example' },
                ],
              },
            ],
          },
        ]),
      },
      api
    );

    const folders = (bar.children ?? []).filter((node) => node.children);
    expect(folders.length).toBe(1);
    expect(linksIn(folders[0] ?? {})).toEqual(['https://d.example', 'https://e.example']);
  });

  it('is idempotent: a second merge adds nothing', async () => {
    const { api, tree, clone } = createFakeBrowser();
    const snapshot = snapshotOf([
      {
        title: '书签栏',
        children: [
          { title: 'A', url: 'https://a.example' },
          { title: 'B', url: 'https://b.example' },
        ],
      },
    ]);

    const first = await restoreSnapshot(
      { mode: 'merge', existingTree: clone(tree), snapshot },
      api
    );
    expect(first.created).toBe(2);

    const second = await restoreSnapshot(
      { mode: 'merge', existingTree: clone(tree), snapshot },
      api
    );
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);
  });

  it('keeps snapshot roots that have no local counterpart under 其他书签', async () => {
    const { api, other, tree, clone } = createFakeBrowser();
    const existing = clone(tree);

    await restoreSnapshot(
      {
        mode: 'merge',
        existingTree: existing,
        snapshot: snapshotOf([
          { title: '书签栏', children: [{ title: 'A', url: 'https://a.example' }] },
          {
            title: '移动设备书签',
            children: [{ title: 'M', url: 'https://m.example' }],
          },
        ]),
      },
      api
    );

    const mobile = (other.children ?? []).find((node) => node.title === '移动设备书签');
    expect(mobile).toBeDefined();
    expect(linksIn(mobile ?? {})).toEqual(['https://m.example']);
  });

  it('maps an Edge-style 收藏夹栏 root onto the local bookmark bar', async () => {
    const { api, bar, tree, clone } = createFakeBrowser();
    const existing = clone(tree);

    const result = await restoreSnapshot(
      {
        mode: 'merge',
        existingTree: existing,
        snapshot: snapshotOf([
          { title: '收藏夹栏', children: [{ title: 'E', url: 'https://e.example' }] },
        ]),
      },
      api
    );

    expect(result.notices).toEqual([]);
    expect(titlesIn(bar)).toEqual(['E']);
    expect(linksIn(bar)).toEqual(['https://e.example']);
  });

  it('keeps an unrecognised root under the bookmark bar and reports it', async () => {
    const { api, bar, tree, clone } = createFakeBrowser();
    const existing = clone(tree);

    const result = await restoreSnapshot(
      {
        mode: 'merge',
        existingTree: existing,
        snapshot: snapshotOf([
          { title: '我的收藏', children: [{ title: 'X', url: 'https://x.example' }] },
        ]),
      },
      api
    );

    expect(result.notices.length).toBe(1);
    expect(result.notices[0]).toContain('我的收藏');
    const folder = (bar.children ?? []).find((node) => node.title === '我的收藏');
    expect(folder).toBeDefined();
    expect(linksIn(folder ?? {})).toEqual(['https://x.example']);
  });

  it('maps roots by folderType even when the titles are localised differently', async () => {
    const { api, bar, tree, clone } = createFakeBrowser();
    // A German-language profile: neither title is recognised by name.
    bar.title = 'Lesezeichenleiste';
    bar.folderType = 'bookmarks-bar';
    const existing = clone(tree);

    const result = await restoreSnapshot(
      {
        mode: 'merge',
        existingTree: existing,
        snapshot: snapshotOf([
          {
            title: 'Lesezeichenleiste',
            folderType: 'bookmarks-bar',
            children: [{ title: 'X', url: 'https://x.example' }],
          },
        ]),
      },
      api
    );

    expect(result.notices).toEqual([]);
    expect(titlesIn(bar)).toEqual(['X']);
  });

  it('never wipes a policy-managed root', async () => {
    const { api, tree, clone } = createFakeBrowser();
    const managed: FakeNode = {
      id: '9',
      title: '管理员书签',
      folderType: 'managed',
      children: [{ id: 'm', title: 'M', url: 'https://managed.example' }],
    };
    tree[0]?.children?.push(managed);
    const existing = clone(tree);

    await restoreSnapshot(
      {
        mode: 'replace',
        existingTree: existing,
        snapshot: snapshotOf([
          { title: '书签栏', children: [{ title: 'C', url: 'https://c.example' }] },
        ]),
      },
      api
    );

    expect(linksIn(managed)).toEqual(['https://managed.example']);
  });
});

describe('restoreSnapshot · replace', () => {
  it('ends up with exactly the snapshot children, without a wrapper folder', async () => {
    const { api, bar, other, tree, clone } = createFakeBrowser();
    bar.children = [
      { id: 'a', title: 'A', url: 'https://a.example' },
      { id: 'b', title: 'B', url: 'https://b.example' },
    ];
    other.children = [{ id: 'o', title: 'O', url: 'https://o.example' }];
    const existing = clone(tree);

    const result = await restoreSnapshot(
      {
        mode: 'replace',
        existingTree: existing,
        snapshot: snapshotOf([
          {
            title: '书签栏',
            children: [
              { title: 'C', url: 'https://c.example' },
              { title: '技术', children: [{ title: 'D', url: 'https://d.example' }] },
            ],
          },
          { title: '其他书签', children: [{ title: 'P', url: 'https://p.example' }] },
        ]),
      },
      api
    );

    expect(result.removed).toBe(3);
    expect(titlesIn(bar)).toEqual(['C', '技术']);
    expect(linksIn(bar)).toEqual(['https://c.example', 'https://d.example']);
    expect(linksIn(other)).toEqual(['https://p.example']);
    // No staging folder left behind.
    expect(titlesIn(bar).some((title) => title.startsWith('MinTab 恢复'))).toBe(false);
  });

  it('clears a local root the snapshot does not mention', async () => {
    const { api, tree, clone } = createFakeBrowser();
    const mobile: FakeNode = { id: '3', title: '移动设备书签', children: [] };
    tree[0]?.children?.push(mobile);
    mobile.children = [{ id: 'm1', title: 'M', url: 'https://m.example' }];
    const existing = clone(tree);

    await restoreSnapshot(
      {
        mode: 'replace',
        existingTree: existing,
        snapshot: snapshotOf([
          { title: '书签栏', children: [{ title: 'C', url: 'https://c.example' }] },
        ]),
      },
      api
    );

    expect(linksIn(mobile)).toEqual([]);
  });

  it('keeps the old bookmarks untouched when cancelled mid-write', async () => {
    const { api, bar, tree, clone } = createFakeBrowser();
    bar.children = [{ id: 'a', title: 'A', url: 'https://a.example' }];
    const existing = clone(tree);
    let created = 0;

    const result = await restoreSnapshot(
      {
        mode: 'replace',
        existingTree: existing,
        snapshot: snapshotOf([
          {
            title: '书签栏',
            children: [
              { title: 'X', url: 'https://x.example' },
              { title: 'Y', url: 'https://y.example' },
              { title: 'Z', url: 'https://z.example' },
            ],
          },
        ]),
        isCancelled: () => created >= 1,
      },
      {
        ...api,
        async create(details) {
          const node = await api.create(details);
          if (details.url) created += 1;
          return node;
        },
      }
    );

    expect(result.cancelled).toBe(true);
    expect(titlesIn(bar)).toEqual(['A']);
    expect(linksIn(bar)).toEqual(['https://a.example']);
  });

  it('keeps the staging folder when lifting a child fails, instead of losing it', async () => {
    const { api, bar, tree, clone } = createFakeBrowser();
    bar.children = [{ id: 'a', title: 'A', url: 'https://a.example' }];
    const existing = clone(tree);
    let moves = 0;

    const result = await restoreSnapshot(
      {
        mode: 'replace',
        existingTree: existing,
        snapshot: snapshotOf([
          {
            title: '书签栏',
            children: [
              { title: 'C', url: 'https://c.example' },
              { title: 'D', url: 'https://d.example' },
            ],
          },
        ]),
      },
      {
        ...api,
        async move(id, destination) {
          moves += 1;
          if (moves === 1) throw new Error('move failed');
          return api.move(id, destination);
        },
      }
    );

    expect(result.failed).toBe(1);
    const staging = (bar.children ?? []).find((node) => node.title.startsWith('MinTab 恢复'));
    expect(staging).toBeDefined();
    // Whatever could not be lifted is still inside the staging folder.
    expect(linksIn(staging ?? {})).toEqual(['https://c.example']);
    // The one that did move is a direct child of the bookmark bar.
    const rootLinks = (bar.children ?? []).filter((node) => node.url).map((node) => node.url);
    expect(rootLinks).toEqual(['https://d.example']);
  });
});

describe('undoLastRestore', () => {
  it('removes only what a merge created', async () => {
    const { api, bar, tree, clone } = createFakeBrowser();
    bar.children = [{ id: 'a', title: 'A', url: 'https://a.example' }];
    const existing = clone(tree);

    await restoreSnapshot(
      {
        mode: 'merge',
        existingTree: existing,
        snapshot: snapshotOf([
          {
            title: '书签栏',
            children: [
              { title: 'C', url: 'https://c.example' },
              { title: '技术', children: [{ title: 'D', url: 'https://d.example' }] },
            ],
          },
        ]),
      },
      api
    );
    expect(getUndoInfo()).toEqual({ mode: 'merge' });

    const undo = await undoLastRestore(api);
    expect(undo?.mode).toBe('merge');
    expect(titlesIn(bar)).toEqual(['A']);
    expect(getUndoInfo()).toBeNull();
  });

  it('rebuilds the pre-restore tree after a replace', async () => {
    const { api, bar, other, tree, clone } = createFakeBrowser();
    bar.children = [
      { id: 'a', title: 'A', url: 'https://a.example' },
      { id: 'b', title: 'B', url: 'https://b.example' },
    ];
    other.children = [{ id: 'o', title: 'O', url: 'https://o.example' }];
    const existing = clone(tree);

    await restoreSnapshot(
      {
        mode: 'replace',
        existingTree: existing,
        snapshot: snapshotOf([
          { title: '书签栏', children: [{ title: 'C', url: 'https://c.example' }] },
        ]),
      },
      api
    );
    expect(linksIn(bar)).toEqual(['https://c.example']);

    const undo = await undoLastRestore(api);
    expect(undo?.mode).toBe('replace');
    expect(linksIn(bar).sort()).toEqual(['https://a.example', 'https://b.example']);
    expect(linksIn(other)).toEqual(['https://o.example']);
  });

  it('does nothing when there is no restore to undo', async () => {
    const { api } = createFakeBrowser();
    expect(await undoLastRestore(api)).toBeNull();
  });
});
