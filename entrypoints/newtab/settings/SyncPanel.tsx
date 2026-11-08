import { AlertCircle, ExternalLink, Link2, Loader2, LogOut, RefreshCw, Upload } from 'lucide-react';
import { useRef } from 'react';
import { backend } from '../../../lib/backend';
import { countLocalLinks } from '../../../lib/bookmark-transfer';
import { SITE_BASE } from '../../../lib/constants';
import type { BrowserBookmarkNode, User } from '../../../lib/types';
import { formatRelativeTime } from '../../../lib/utils';
import { RestorePanel } from './RestorePanel';
import {
  cardClass,
  dangerGhostButton,
  ghostButton,
  PanelSection,
  primaryButton,
  secondaryButton,
} from './ui';

interface Props {
  user: User | null;
  sessionError: string;
  uploading: boolean;
  lastUpload: number | null;
  bookmarks: BrowserBookmarkNode[];
  /** Bumped by the parent after each successful upload. */
  uploadTick: number;
  onUpload: () => void;
  onConnect: () => void;
  onRefreshSession: () => void;
  onUnlink: () => void;
  onPauseRefresh: () => void;
  onResumeRefresh: () => void;
}

function formatUploadTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Account, upload and restore: connect once, then two plain settings blocks. */
export function SyncPanel({
  user,
  sessionError,
  uploading,
  lastUpload,
  bookmarks,
  uploadTick,
  onUpload,
  onConnect,
  onRefreshSession,
  onUnlink,
  onPauseRefresh,
  onResumeRefresh,
}: Props) {
  const uploadRef = useRef<HTMLDivElement>(null);
  const localLinks = countLocalLinks(bookmarks);

  if (!backend.supportsAccount) {
    return (
      <div className="space-y-6">
        <PanelSection title="账号与同步">
          <div className={`${cardClass} px-4 py-3.5`}>
            <p className="text-sm font-medium">纯本地模式</p>
            <p className="mt-1 text-xs leading-5 text-black/55">
              当前构建不上传任何数据：书签只在本机读取和编辑，账号、云快照与恢复功能已关闭。
            </p>
          </div>
        </PanelSection>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PanelSection title="账号">
        {user ? (
          <div className={`${cardClass} p-3.5`}>
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#176b61]/10 text-sm font-semibold text-[#176b61]">
                {user.email.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.email}</p>
                <p className="mt-0.5 text-[11px] text-black/45">快照保存在这个账号下</p>
              </div>
              <span className="shrink-0 rounded-full bg-[#26734d]/10 px-2 py-0.5 text-[11px] font-medium text-[#26734d]">
                已连接
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-black/6 pt-2.5">
              <button
                type="button"
                className={ghostButton}
                onClick={() => window.open(`${SITE_BASE}/account`, '_blank')}
              >
                <ExternalLink size={13} />
                个人主页
              </button>
              <button type="button" className={`${dangerGhostButton} ml-auto`} onClick={onUnlink}>
                <LogOut size={13} />
                断开连接
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-black/15 bg-white/50 px-4 py-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#176b61]/10 text-[#176b61]">
              <Link2 size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">尚未连接账号</p>
              <p className="mt-0.5 text-[11px] text-black/50">
                连接后可在多台设备间上传与恢复书签。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={secondaryButton} onClick={onRefreshSession}>
                <RefreshCw size={14} />
                重新检测
              </button>
              <button type="button" className={primaryButton} onClick={onConnect}>
                <Link2 size={14} />
                连接账号
              </button>
            </div>
          </div>
        )}
        {sessionError && (
          <div
            role="alert"
            className="mt-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">登录状态检测失败：{sessionError}</span>
            <button
              type="button"
              className="focus-ring shrink-0 rounded px-1 font-medium underline"
              onClick={onRefreshSession}
            >
              重试
            </button>
          </div>
        )}
      </PanelSection>

      {user && (
        <>
          <div ref={uploadRef} className="scroll-mt-2">
            <PanelSection title="上传">
              <div className={`${cardClass} flex flex-wrap items-center gap-3 px-3.5 py-3`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">本地 {localLinks} 个书签</p>
                  <p className="mt-0.5 text-[11px] text-black/45">
                    {lastUpload
                      ? `上次上传：${formatRelativeTime(lastUpload)} · ${formatUploadTime(lastUpload)}`
                      : '还没有上传过'}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${primaryButton} w-full sm:w-auto`}
                  onClick={onUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Upload size={15} />
                  )}
                  {uploading ? '上传中…' : '上传数据'}
                </button>
              </div>
            </PanelSection>
          </div>

          <PanelSection title="恢复">
            <RestorePanel
              user={user}
              bookmarks={bookmarks}
              refreshToken={uploadTick}
              onPauseRefresh={onPauseRefresh}
              onResumeRefresh={onResumeRefresh}
              onOpenUpload={() =>
                uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            />
          </PanelSection>
        </>
      )}
    </div>
  );
}
