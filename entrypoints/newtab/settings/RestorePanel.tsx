import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { backend, type UploadSummary } from '../../../lib/backend';
import { downloadLocalBackup } from '../../../lib/backup';
import { countLocalLinks } from '../../../lib/bookmark-transfer';
import {
  getUndoInfo,
  type RestoreMode,
  type RestoreProgress,
  type RestoreResult,
  restoreSnapshot,
  undoLastRestore,
} from '../../../lib/restore';
import type { BrowserBookmarkNode, User } from '../../../lib/types';
import { cardClass, fieldClass, inlineLink, primaryButton, secondaryButton } from './ui';

interface Props {
  user: User;
  bookmarks: BrowserBookmarkNode[];
  /** Bumped by the parent after a successful upload, so the list re-fetches. */
  refreshToken: number;
  onPauseRefresh: () => void;
  onResumeRefresh: () => void;
  /** Scrolls to the upload block so the user can create a first snapshot. */
  onOpenUpload: () => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; progress: RestoreProgress | null; note: string }
  | { kind: 'done'; message: string; backup: string; notices: string[] }
  | { kind: 'error'; message: string };

const SNAPSHOT_LIMIT = 20;
/** Re-rendering for every single created bookmark would stall the page. */
const PROGRESS_THROTTLE_MS = 120;

/** Compact absolute time; the year is dropped for snapshots from this year. */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleString('zh-CN', options);
}

function browserLabel(upload: UploadSummary): string {
  const name = upload.browser || '浏览器';
  return upload.browser_version ? `${name} ${upload.browser_version}` : name;
}

function summarize(result: RestoreResult): string {
  const parts = [`新增 ${result.created}`, `跳过 ${result.skipped}`];
  if (result.failed > 0) parts.push(`失败 ${result.failed}`);
  if (result.mode === 'replace') parts.push(`删除 ${result.removed}`);
  return `完成：${parts.join('，')}。`;
}

/**
 * Restore a cloud snapshot into this browser.
 *
 * Two modes, both of which build into a new wrapper folder first:
 * - merge:   only adds links that are not present locally (idempotent).
 * - replace: after the write succeeds, clears the other bookmarks.
 * A local HTML backup is exported before anything is written.
 */
export function RestorePanel({
  user,
  bookmarks,
  refreshToken,
  onPauseRefresh,
  onResumeRefresh,
  onOpenUpload,
}: Props) {
  const [uploads, setUploads] = useState<UploadSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // Kept outside `phase` so the undo entry survives closing and reopening the
  // dialog during the same page session.
  const [undoable, setUndoable] = useState(() => getUndoInfo() !== null);
  const cancelRef = useRef(false);
  const lastProgressRef = useRef(0);
  const loadedForUser = useRef<number | null>(null);

  const localLinks = countLocalLinks(bookmarks);
  const running = phase.kind === 'running';
  const userId = user.id;

  useEffect(() => {
    // `refreshToken` is only a trigger: bumping it (a finished upload) must re-run
    // this fetch, so it is referenced here and kept in the dependency list.
    void refreshToken;

    // Switching accounts must not show the previous account's snapshots; a
    // refresh after an upload keeps the list on screen while it reloads.
    if (loadedForUser.current !== userId) {
      loadedForUser.current = userId;
      setUploads(null);
    }

    let active = true;
    setLoading(true);
    setLoadError('');
    void backend
      .listUploads(SNAPSHOT_LIMIT)
      .then((list) => {
        if (!active) return;
        setUploads(list);
        // Keep the current selection while it still exists - a Free account
        // trims old snapshots on upload, so it may be gone.
        setSelectedId((current) =>
          current !== null && list.some((item) => item.id === current)
            ? current
            : (list[0]?.id ?? null)
        );
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : '加载上传记录失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, refreshToken]);

  const start = async () => {
    if (!selectedId || running) return;
    const upload = uploads?.find((item) => item.id === selectedId);
    if (!upload) return;

    if (mode === 'replace' && localLinks > 0) {
      const confirmed = window.confirm(
        `将删除本地 ${localLinks} 个书签，并用这份快照（${upload.entry_count} 个）替换。\n\n确定继续？`
      );
      if (!confirmed) return;
    }

    // Deliberately synchronous: a download started after an `await` has lost the
    // user gesture and browsers may drop it without telling anyone.
    let backup = '';
    if ((mode === 'replace' || backupEnabled) && localLinks > 0) {
      try {
        backup = downloadLocalBackup(bookmarks);
      } catch {
        if (mode === 'replace') {
          setPhase({ kind: 'error', message: '无法导出本地备份，已取消覆盖' });
          return;
        }
      }
    }

    cancelRef.current = false;
    lastProgressRef.current = 0;
    setPhase({ kind: 'running', progress: null, note: '正在获取快照…' });

    try {
      const snapshot = await backend.getSnapshot(upload.id);

      onPauseRefresh();
      const result = await restoreSnapshot({
        mode,
        snapshot,
        existingTree: bookmarks,
        isCancelled: () => cancelRef.current,
        onProgress: (progress) => {
          const now = Date.now();
          if (now - lastProgressRef.current < PROGRESS_THROTTLE_MS) return;
          lastProgressRef.current = now;
          setPhase({ kind: 'running', progress, note: '正在写入书签…' });
        },
      });

      setPhase({
        kind: 'done',
        message: result.cancelled ? '已取消，本地书签未做修改。' : summarize(result),
        backup,
        notices: result.notices,
      });
      setUndoable(getUndoInfo() !== null);
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : '恢复失败' });
    } finally {
      onResumeRefresh();
    }
  };

  const undo = async () => {
    if (running) return;
    setPhase({ kind: 'running', progress: null, note: '正在撤销…' });
    try {
      const result = await undoLastRestore();
      if (!result) {
        setPhase({ kind: 'error', message: '没有可撤销的操作' });
        return;
      }
      setPhase({
        kind: 'done',
        message:
          result.mode === 'merge'
            ? `已撤销：删除了本次合并新增的 ${result.changed} 个节点${result.failed ? `，${result.failed} 个未能删除` : ''}。`
            : `已撤销：原书签已重新写回（${result.changed} 个节点${result.failed ? `，${result.failed} 个失败` : ''}）。`,
        backup: '',
        notices: [],
      });
      setUndoable(false);
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : '撤销失败' });
    } finally {
      onResumeRefresh();
    }
  };

  const percent =
    phase.kind === 'running' && phase.progress && phase.progress.total > 0
      ? Math.min(100, Math.round((phase.progress.processed / phase.progress.total) * 100))
      : 0;

  if (loadError) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700"
      >
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1">{loadError}</span>
      </div>
    );
  }

  if (uploads === null) {
    return <p className="py-6 text-center text-xs text-black/40">正在读取云端快照…</p>;
  }

  if (uploads.length === 0) {
    return (
      <div className={`${cardClass} flex flex-wrap items-center gap-2 px-3.5 py-3`}>
        <p className="min-w-0 flex-1 text-xs text-black/50">云上还没有快照，先上传一次当前书签。</p>
        <button type="button" className={inlineLink} onClick={onOpenUpload}>
          去上传
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`${cardClass} space-y-3 p-3.5`}>
        <select
          value={selectedId ?? ''}
          onChange={(event) => setSelectedId(Number(event.target.value))}
          disabled={running}
          aria-label="选择快照"
          className={fieldClass}
        >
          {uploads.map((upload, index) => (
            <option key={upload.id} value={upload.id}>
              {browserLabel(upload)} · {formatTime(upload.created_at)} · {upload.entry_count} 条
              {index === 0 ? '（最新）' : ''}
            </option>
          ))}
        </select>
        {loading && <p className="text-[11px] text-black/40">正在更新列表…</p>}

        <div>
          <fieldset
            aria-label="恢复方式"
            className="flex rounded-lg border border-black/8 bg-black/[0.03] p-0.5"
          >
            {(['merge', 'replace'] as const).map((item) => {
              const active = mode === item;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={active}
                  disabled={running}
                  onClick={() => setMode(item)}
                  className={`focus-ring flex-1 rounded-md px-3 py-1.5 text-xs transition disabled:cursor-not-allowed ${
                    active
                      ? item === 'replace'
                        ? 'bg-white font-medium text-amber-700 shadow-sm'
                        : 'bg-white font-medium text-[#176b61] shadow-sm'
                      : 'text-black/55 hover:text-black/80'
                  }`}
                >
                  {item === 'merge' ? '合并到本地' : '覆盖本地'}
                </button>
              );
            })}
          </fieldset>
          <p
            className={`mt-1.5 text-[11px] leading-4 ${
              mode === 'replace' ? 'text-amber-600' : 'text-black/45'
            }`}
          >
            {mode === 'merge'
              ? '只补充本地没有的链接，不删除现有书签。'
              : `会删除本地其他书签（当前 ${localLinks} 个），开始后会再确认一次。`}
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-black/65">
          <input
            type="checkbox"
            checked={backupEnabled || mode === 'replace'}
            disabled={mode === 'replace' || running}
            onChange={(event) => setBackupEnabled(event.target.checked)}
            className="size-4 shrink-0 accent-[#26734d]"
          />
          恢复前备份本地书签
          {mode === 'replace' && <span className="text-black/40">（覆盖模式必须）</span>}
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              取消
            </button>
          ) : (
            <button
              type="button"
              className={primaryButton}
              onClick={() => void start()}
              disabled={!selectedId}
            >
              <RotateCcw size={15} />
              开始恢复
            </button>
          )}
          {undoable && !running && (
            <button type="button" className={inlineLink} onClick={() => void undo()}>
              <Undo2 size={13} className="mr-1 inline" />
              撤销上次恢复
            </button>
          )}
        </div>

        {phase.kind === 'running' && (
          <div className="border-t border-black/6 pt-3" aria-live="polite">
            <div className="flex items-center gap-2 text-xs text-black/60">
              <Loader2 size={14} className="shrink-0 animate-spin" />
              <span className="min-w-0 flex-1">{phase.note}</span>
              {phase.progress && (
                <span className="shrink-0 tabular-nums text-black/40">{percent}%</span>
              )}
            </div>
            {phase.progress && (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.08]">
                  <div
                    className="h-full rounded-full bg-[#26734d] transition-[width] duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] leading-4 text-black/40">
                  新增 {phase.progress.created} · 跳过 {phase.progress.skipped}
                  {phase.progress.failed > 0 ? ` · 失败 ${phase.progress.failed}` : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {phase.kind === 'done' && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"
        >
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p>{phase.message}</p>
            {phase.backup && (
              <p className="mt-0.5 text-emerald-700/80">备份已下载：{phase.backup}</p>
            )}
            {phase.notices.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-emerald-700/80">
                {phase.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {phase.kind === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{phase.message}</span>
        </div>
      )}
    </div>
  );
}
