import { describe, expect, it } from 'vitest';
import { subfolderGroups, visibleGroups } from '../lib/browser-bookmarks';
import type { BrowserBookmarkNode } from '../lib/types';

/** 书签栏 > 技术 > 前端 > React, plus 书签栏 > 生活. */
function buildTree(): BrowserBookmarkNode {
  return {
    id: '1',
    title: '书签栏',
    children: [
      {
        id: 'tech',
        title: '技术',
        children: [
          {
            id: 'frontend',
            title: '前端',
            children: [
              {
                id: 'react',
                title: 'React',
                children: [{ id: 'link', title: '文档', url: 'https://react.dev' }],
              },
            ],
          },
          { id: 'mdn', title: 'MDN', url: 'https://developer.mozilla.org' },
        ],
      },
      {
        id: 'life',
        title: '生活',
        children: [{ id: 'recipes', title: '菜谱', children: [] }],
      },
    ],
  };
}

describe('subfolderGroups', () => {
  it('lists nested folders with the folders above them as ancestors', () => {
    const groups = subfolderGroups(buildTree());
    const byId = new Map(groups.map((group) => [group.folder.id, group]));

    expect(byId.get('tech')?.ancestorIds).toEqual([]);
    expect(byId.get('frontend')?.ancestorIds).toEqual(['tech']);
    expect(byId.get('react')?.ancestorIds).toEqual(['tech', 'frontend']);
    expect(byId.get('life')?.ancestorIds).toEqual([]);
  });

  it('keeps each folder title as its path from the root', () => {
    const groups = subfolderGroups(buildTree());
    expect(groups.map((group) => group.title)).toEqual([
      '技术',
      '技术 / 前端',
      '技术 / 前端 / React',
      '生活',
      '生活 / 菜谱',
    ]);
  });
});

describe('visibleGroups', () => {
  it('folds away everything below a collapsed folder but keeps its header', () => {
    const groups = subfolderGroups(buildTree());
    const visible = visibleGroups(groups, new Set(['tech']));

    expect(visible.map((group) => group.folder.id)).toEqual(['tech', 'life', 'recipes']);
  });

  it('only hides the descendants of the collapsed folder, not other branches', () => {
    const groups = subfolderGroups(buildTree());
    const visible = visibleGroups(groups, new Set(['frontend']));

    expect(visible.map((group) => group.folder.id)).toEqual([
      'tech',
      'frontend',
      'life',
      'recipes',
    ]);
  });

  it('shows every group when nothing is collapsed', () => {
    const groups = subfolderGroups(buildTree());
    expect(visibleGroups(groups, new Set()).map((group) => group.folder.id)).toEqual([
      'tech',
      'frontend',
      'react',
      'life',
      'recipes',
    ]);
  });
});
