import {
  collectUrls,
  countNodes,
  normalizeUrl,
  type RootKind,
  rootKindOfNode,
  type SnapshotNode,
  snapshotChildren,
} from './bookmark-transfer';
import { PRODUCT_NAME } from './constants';
import type { BrowserBookmarkNode } from './types';

export type RestoreMode = 'merge' | 'replace';

export interface RestoreProgress {
  processed: number;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  current: string;
}

export interface RestoreResult {
  mode: RestoreMode;
  created: number;
  skipped: number;
  failed: number;
  /** Bookmarks removed by `replace` (0 for merge). */
  removed: number;
  cancelled: boolean;
  /** Roots that had no local counterpart, and where their content went. */
  notices: string[];
}

export interface UndoResult {
  mode: RestoreMode;
  /** Nodes deleted (merge) or re-created (replace) by the undo. */
  changed: number;
  failed: number;
}

/**
 * The subset of `browser.bookmarks` the restore engine needs.
 *
 * Injected instead of imported so the merge/replace/undo logic can be exercised
 * against an in-memory fake - the interesting bugs (duplicates, half-wipes,
 * leftover folders) have nothing to do with the real browser.
 */
export interface BookmarkApi {
  create(details: { parentId: string; title?: string; url?: string }): Promise<{ id: string }>;
  remove(id: string): Promise<void>;
  removeTree(id: string): Promise<void>;
  move(id: string, destination: { parentId?: string; index?: number }): Promise<unknown>;
  getTree(): Promise<BrowserBookmarkNode[]>;
  getSubTree(id: string): Promise<BrowserBookmarkNode[]>;
}

interface JournalEntry {
  id: string;
  kind: 'folder' | 'link';
}

type UndoRecord =
  | { mode: 'merge'; created: JournalEntry[] }
  | { mode: 'replace'; previousTree: BrowserBookmarkNode[] };

/** One restore is far more than any real bookmark set; refuse runaway snapshots. */
const MAX_RESTORE_NODES = 20_000;

class CancelledError extends Error {}

interface Ctx {
  total: number;
  processed: number;
  created: number;
  skipped: number;
  failed: number;
  seen: Set<string>;
  journal: JournalEntry[];
  onProgress?: (progress: RestoreProgress) => void;
  isCancelled?: () => boolean;
}

interface TargetSource {
  nodes: SnapshotNode[];
  /** Set when the snapshot root has no local counterpart; content is nested. */
  label?: string;
}

interface Target {
  local: BrowserBookmarkNode;
  sources: TargetSource[];
}

let lastRestore: UndoRecord | null = null;

export function resetUndoState(): void {
  lastRestore = null;
}

function isFolder(node: { children?: unknown }): boolean {
  return Array.isArray(node.children);
}

function normalizeTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function stamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function titleOf(node: SnapshotNode, fallback = '未命名文件夹'): string {
  return typeof node.title === 'string' && node.title.trim() ? node.title : fallback;
}

function urlOf(node: SnapshotNode): string {
  return typeof node.url === 'string' ? node.url.trim() : '';
}

function localRoots(tree: BrowserBookmarkNode[]): BrowserBookmarkNode[] {
  // Policy-managed roots cannot be written to, and wiping them is not our call.
  return (tree[0]?.children ?? []).filter(
    (node) => isFolder(node) && node.folderType !== 'managed' && !node.unmodifiable
  );
}

interface RootSource {
  title: string;
  kind: RootKind | null;
  children: SnapshotNode[];
}

/** Snapshot root folders; a flat snapshot is treated as bookmark-bar content. */
function rootSourcesOf(
  snapshot: SnapshotNode[],
  localRootList: BrowserBookmarkNode[]
): RootSource[] {
  const roots = snapshotChildren(snapshot)
    .filter((node) => isFolder(node))
    .map((node) => ({
      title: typeof node.title === 'string' ? node.title : '',
      kind: rootKindOfNode(node),
      children: Array.isArray(node.children) ? node.children : [],
    }));
  if (roots.length > 0) return roots;

  const bar = localRootList.find((root) => rootKindOfNode(root) === 'bar') ?? localRootList[0];
  return [{ title: bar?.title ?? '', kind: 'bar', children: snapshotChildren(snapshot) }];
}

/**
 * Pair every snapshot root folder with the local root that should receive it.
 * A snapshot root with no local counterpart (e.g. 移动设备书签 on a desktop
 * Chrome without sync) keeps its content under a folder of the same name inside
 * 其他书签 instead of being dropped.
 */
function groupTargets(
  sources: RootSource[],
  localRootList: BrowserBookmarkNode[]
): { targets: Target[]; notices: string[] } {
  const byKind = new Map<RootKind, BrowserBookmarkNode>();
  for (const root of localRootList) {
    const kind = rootKindOfNode(root);
    if (kind && !byKind.has(kind)) byKind.set(kind, root);
  }

  // Fallbacks keep a completely unrecognised local layout usable: the first root
  // folder acts as the bookmark bar, the second as "other bookmarks".
  const bar = byKind.get('bar') ?? localRootList[0];
  if (!bar) throw new Error('浏览器里没有可用的书签文件夹');
  const other = byKind.get('other') ?? localRootList[1] ?? bar;

  const targets = new Map<string, Target>();
  const notices: string[] = [];
  const ensure = (local: BrowserBookmarkNode): Target => {
    const existing = targets.get(local.id);
    if (existing) return existing;
    const created: Target = { local, sources: [] };
    targets.set(local.id, created);
    return created;
  };

  for (const source of sources) {
    const kind = source.kind;
    const matched = kind ? byKind.get(kind) : undefined;
    if (matched) {
      ensure(matched).sources.push({ nodes: source.children });
      continue;
    }

    // No local counterpart. Keep the content visible: mobile/other content goes
    // next to "other bookmarks", anything else under the bookmark bar, always
    // inside a folder named after the original root.
    const host = kind === 'mobile' || kind === 'other' ? other : bar;
    const label = source.title || '导入的书签';
    ensure(host).sources.push({ nodes: source.children, label });
    const localNames = localRootList.map((root) => root.title).join('、');
    notices.push(
      `快照里的「${label}」没有匹配到本地根文件夹，内容已放进「${host.title}/${label}」（本地根文件夹：${localNames}）`
    );
  }

  return { targets: [...targets.values()], notices };
}

function report(ctx: Ctx, current: string): void {
  ctx.onProgress?.({
    processed: ctx.processed,
    total: ctx.total,
    created: ctx.created,
    skipped: ctx.skipped,
    failed: ctx.failed,
    current,
  });
}

/**
 * Recreate `nodes` verbatim under `parentId` (replace mode).
 *
 * Sequential on purpose: the bookmarks API appends in call order, so awaiting
 * each item preserves the snapshot's order. Empty folders are kept - the point of
 * `replace` is to end up with exactly what the snapshot contained.
 */
async function writeVerbatim(
  nodes: SnapshotNode[],
  parentId: string,
  ctx: Ctx,
  api: BookmarkApi
): Promise<void> {
  for (const node of nodes) {
    if (ctx.isCancelled?.()) throw new CancelledError('cancelled');
    ctx.processed += 1;

    if (isFolder(node)) {
      const title = titleOf(node);
      const folder = await api.create({ parentId, title });
      ctx.created += 1;
      await writeVerbatim(Array.isArray(node.children) ? node.children : [], folder.id, ctx, api);
      report(ctx, title);
      continue;
    }

    const url = urlOf(node);
    if (!url) continue;
    const title = titleOf(node, url);
    try {
      await api.create({ parentId, title, url });
      ctx.created += 1;
    } catch {
      ctx.failed += 1;
    }
    report(ctx, title);
  }
}

/** Find a folder with this title under `parentId`, creating it when missing. */
async function findOrCreateFolder(
  parentId: string,
  title: string,
  ctx: Ctx,
  api: BookmarkApi
): Promise<string> {
  const children = (await api.getSubTree(parentId))[0]?.children ?? [];
  const match = children.find(
    (child) => isFolder(child) && normalizeTitle(child.title) === normalizeTitle(title)
  );
  if (match) return match.id;

  const created = await api.create({ parentId, title });
  ctx.journal.push({ id: created.id, kind: 'folder' });
  ctx.created += 1;
  return created.id;
}

/**
 * Merge `nodes` into the existing structure: folders are matched by title and
 * reused, only links that are not already present anywhere are added.
 */
async function mergeNodes(
  nodes: SnapshotNode[],
  parentId: string,
  ctx: Ctx,
  api: BookmarkApi
): Promise<void> {
  for (const node of nodes) {
    if (ctx.isCancelled?.()) throw new CancelledError('cancelled');
    ctx.processed += 1;

    if (isFolder(node)) {
      const title = titleOf(node);
      const folderId = await findOrCreateFolder(parentId, title, ctx, api);
      await mergeNodes(Array.isArray(node.children) ? node.children : [], folderId, ctx, api);
      report(ctx, title);
      continue;
    }

    const url = urlOf(node);
    if (!url) continue;
    const title = titleOf(node, url);
    const key = normalizeUrl(url);
    if (ctx.seen.has(key)) {
      ctx.skipped += 1;
      report(ctx, title);
      continue;
    }

    try {
      const created = await api.create({ parentId, title, url });
      ctx.journal.push({ id: created.id, kind: 'link' });
      ctx.created += 1;
      ctx.seen.add(key);
    } catch {
      ctx.failed += 1;
    }
    report(ctx, title);
  }
}

async function mergeIntoTree(
  snapshot: SnapshotNode[],
  existingTree: BrowserBookmarkNode[],
  ctx: Ctx,
  api: BookmarkApi
): Promise<string[]> {
  const localRootList = localRoots(existingTree);
  const { targets, notices } = groupTargets(rootSourcesOf(snapshot, localRootList), localRootList);

  for (const target of targets) {
    for (const source of target.sources) {
      const parentId = source.label
        ? await findOrCreateFolder(target.local.id, source.label, ctx, api)
        : target.local.id;
      await mergeNodes(source.nodes, parentId, ctx, api);
    }
  }
  return notices;
}

/**
 * Replace every local root folder with the snapshot's content.
 *
 * Build first, swap after: each target root gets a staging folder that receives
 * the full snapshot content. Only when all of them are written are the old
 * bookmarks deleted; then the staged children are moved up into the root and the
 * staging folder is dropped, so the root ends up with exactly the snapshot's
 * children - no extra wrapper, no extra 书签栏 level.
 */
async function replaceAtRoots(
  snapshot: SnapshotNode[],
  existingTree: BrowserBookmarkNode[],
  ctx: Ctx,
  api: BookmarkApi
): Promise<{ removed: number; notices: string[] }> {
  const localRootList = localRoots(existingTree);
  const { targets, notices } = groupTargets(rootSourcesOf(snapshot, localRootList), localRootList);
  const staging = new Map<string, string>();

  try {
    for (const target of targets) {
      const stage = await api.create({
        parentId: target.local.id,
        title: `${PRODUCT_NAME} 恢复 ${stamp()}`,
      });
      staging.set(target.local.id, stage.id);

      for (const source of target.sources) {
        if (source.label) {
          const sub = await api.create({ parentId: stage.id, title: source.label });
          ctx.created += 1;
          await writeVerbatim(source.nodes, sub.id, ctx, api);
        } else {
          await writeVerbatim(source.nodes, stage.id, ctx, api);
        }
      }
    }
  } catch (error) {
    for (const id of staging.values()) {
      await api.removeTree(id).catch(() => undefined);
    }
    throw error;
  }

  // Written successfully: now the old bookmarks can go.
  let removed = 0;
  for (const root of localRootList) {
    const keep = staging.get(root.id);
    const fresh = await api.getSubTree(root.id);
    for (const child of fresh[0]?.children ?? []) {
      if (child.id === keep) continue;
      try {
        await api.removeTree(child.id);
        removed += 1;
      } catch {
        // A policy-managed or otherwise unmodifiable node: keep going.
      }
    }
  }

  // Lift the staged content up one level (moving a folder moves its subtree).
  // If a move fails, the staging folder keeps whatever is left: deleting it
  // would silently drop bookmarks, which is the one thing this flow must avoid.
  for (const [localId, stageId] of staging) {
    const fresh = await api.getSubTree(stageId);
    let failedMoves = 0;
    for (const child of fresh[0]?.children ?? []) {
      try {
        await api.move(child.id, { parentId: localId });
      } catch {
        failedMoves += 1;
      }
    }
    if (failedMoves === 0) await api.removeTree(stageId).catch(() => undefined);
    else ctx.failed += failedMoves;
  }

  return { removed, notices };
}

/**
 * Write a snapshot into the browser.
 *
 * - merge:   adds only what is missing, inside the real folder structure; undo
 *            replays the journal of created nodes.
 * - replace: root folders end up containing exactly the snapshot's children;
 *            undo rebuilds the pre-restore tree the same way.
 */
export async function restoreSnapshot(
  options: {
    mode: RestoreMode;
    snapshot: SnapshotNode[];
    existingTree: BrowserBookmarkNode[];
    onProgress?: (progress: RestoreProgress) => void;
    isCancelled?: () => boolean;
  },
  api: BookmarkApi
): Promise<RestoreResult> {
  // Only the nodes that are actually written count towards progress; the
  // snapshot's own root folders are mapped onto local roots, not recreated.
  const snapshotRoots = snapshotChildren(options.snapshot).filter((node) => isFolder(node));
  const total =
    snapshotRoots.length > 0
      ? snapshotRoots.reduce(
          (sum, root) => sum + countNodes(Array.isArray(root.children) ? root.children : []),
          0
        )
      : countNodes(snapshotChildren(options.snapshot));
  if (total === 0) throw new Error('这份快照里没有书签');
  if (total > MAX_RESTORE_NODES) {
    throw new Error(`快照共有 ${total} 个节点，超过单次恢复上限 ${MAX_RESTORE_NODES}`);
  }
  if (localRoots(options.existingTree).length === 0) {
    throw new Error('浏览器里没有可用的书签文件夹');
  }

  const ctx: Ctx = {
    total,
    processed: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    seen: collectUrls(options.existingTree),
    journal: [],
    onProgress: options.onProgress,
    isCancelled: options.isCancelled,
  };

  lastRestore = null;

  try {
    if (options.mode === 'merge') {
      const notices = await mergeIntoTree(options.snapshot, options.existingTree, ctx, api);
      lastRestore = { mode: 'merge', created: ctx.journal };
      return {
        mode: 'merge',
        created: ctx.created,
        skipped: ctx.skipped,
        failed: ctx.failed,
        removed: 0,
        cancelled: false,
        notices,
      };
    }

    const { removed, notices } = await replaceAtRoots(
      options.snapshot,
      options.existingTree,
      ctx,
      api
    );
    lastRestore = { mode: 'replace', previousTree: options.existingTree };
    return {
      mode: 'replace',
      created: ctx.created,
      skipped: 0,
      failed: ctx.failed,
      removed,
      cancelled: false,
      notices,
    };
  } catch (error) {
    if (error instanceof CancelledError) {
      // Keep whatever a partial merge created so the user can still undo it.
      if (options.mode === 'merge' && ctx.journal.length > 0) {
        lastRestore = { mode: 'merge', created: ctx.journal };
      }
      return {
        mode: options.mode,
        created: ctx.created,
        skipped: ctx.skipped,
        failed: ctx.failed,
        removed: 0,
        cancelled: true,
        notices: [],
      };
    }
    throw error;
  }
}

/** Whether the most recent restore in this page session can still be undone. */
export function getUndoInfo(): { mode: RestoreMode } | null {
  return lastRestore ? { mode: lastRestore.mode } : null;
}

/**
 * Undo the last restore.
 *
 * - merge: delete the nodes that were created, deepest first.
 * - replace: rebuild the pre-restore tree with the same root-level algorithm.
 */
export async function undoLastRestore(api: BookmarkApi): Promise<UndoResult | null> {
  const previous = lastRestore;
  if (!previous) return null;
  lastRestore = null;

  if (previous.mode === 'merge') {
    let changed = 0;
    let failed = 0;
    for (const entry of [...previous.created].reverse()) {
      try {
        if (entry.kind === 'folder') await api.removeTree(entry.id);
        else await api.remove(entry.id);
        changed += 1;
      } catch {
        failed += 1;
      }
    }
    return { mode: 'merge', changed, failed };
  }

  const existingTree = await api.getTree();
  const ctx: Ctx = {
    total: countNodes(snapshotChildren(previous.previousTree)),
    processed: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    seen: new Set(),
    journal: [],
  };
  await replaceAtRoots(previous.previousTree, existingTree, ctx, api);
  return { mode: 'replace', changed: ctx.created, failed: ctx.failed };
}
