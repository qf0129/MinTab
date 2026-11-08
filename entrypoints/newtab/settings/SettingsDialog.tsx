import {
  CloudUpload,
  Palette,
  Search as SearchIcon,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PRODUCT_NAME } from '../../../lib/constants';
import type { BrowserBookmarkNode, Settings, User } from '../../../lib/types';
import { AppearancePanel } from './AppearancePanel';
import { SearchPanel } from './SearchPanel';
import { SyncPanel } from './SyncPanel';

interface Props {
  open: boolean;
  settings: Settings;
  user: User | null;
  sessionError: string;
  uploading: boolean;
  lastUpload: number | null;
  bookmarks: BrowserBookmarkNode[];
  /** Incremented by the parent after each successful upload. */
  uploadTick: number;
  onClose: () => void;
  onSettings: (patch: Partial<Settings>) => unknown | Promise<unknown>;
  onRefreshSession: () => void;
  onUpload: () => void;
  onConnect: () => void;
  onUnlink: () => void;
  onPauseRefresh: () => void;
  onResumeRefresh: () => void;
}

interface SectionDef {
  id: 'sync' | 'appearance' | 'search';
  label: string;
  title: string;
  icon: typeof CloudUpload;
}

const SECTIONS = [
  {
    id: 'sync',
    label: '账号与同步',
    title: '账号与同步',
    icon: CloudUpload,
  },
  {
    id: 'appearance',
    label: '外观',
    title: '外观',
    icon: Palette,
  },
  {
    id: 'search',
    label: '搜索',
    title: '搜索',
    icon: SearchIcon,
  },
] as const satisfies readonly SectionDef[];

export function SettingsDialog({
  open,
  settings,
  user,
  sessionError,
  uploading,
  lastUpload,
  bookmarks,
  uploadTick,
  onClose,
  onSettings,
  onRefreshSession,
  onUpload,
  onConnect,
  onUnlink,
  onPauseRefresh,
  onResumeRefresh,
}: Props) {
  const [section, setSection] = useState<SectionDef['id']>('sync');
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // The parent passes a fresh `onClose` on every render; going through a ref
  // keeps the open/close effect from re-running (and stealing focus) each time.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
    };
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Hand focus back to the settings button instead of dropping it on <body>.
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    // `section` is only a trigger: each panel starts at its own top edge, not
    // wherever the previously visible one scrolled.
    void section;
    contentRef.current?.scrollTo({ top: 0 });
  }, [section]);

  if (!open) return null;

  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 text-[#1f2928] sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-[#0f1a1c]/45 backdrop-blur-sm"
        aria-label="关闭设置"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="surface relative flex max-h-[min(720px,calc(100vh-24px))] w-full max-w-[880px] overflow-hidden rounded-2xl outline-none sm:max-h-[min(720px,calc(100vh-32px))]"
      >
        <aside className="hidden w-56 shrink-0 flex-col border-r border-black/8 bg-[#f6faf8] px-3 py-5 md:flex">
          <div className="mb-6 flex items-center gap-2.5 px-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#176b61] text-white shadow-sm">
              <SettingsIcon size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5">设置</p>
              <p className="text-[11px] leading-4 text-black/40">{PRODUCT_NAME}</p>
            </div>
          </div>
          <nav aria-label="设置分类" className="space-y-1">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const selected = id === section;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={selected ? 'true' : undefined}
                  className={`focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    selected
                      ? 'bg-[#176b61]/10 font-medium text-[#176b61]'
                      : 'text-black/60 hover:bg-black/[0.04] hover:text-black/80'
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>
          <p className="mt-auto px-2 text-[11px] leading-4 text-black/40">
            设置只保存在本机，不会随书签一起上传。
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-black/8 px-5 py-3 sm:px-6">
            <h2 id="settings-title" className="min-w-0 flex-1 truncate text-base font-semibold">
              {active.title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              title="关闭（Esc）"
              aria-label="关闭设置"
              className="focus-ring -mr-1 shrink-0 rounded-lg p-2 text-black/40 transition hover:bg-black/[0.05] hover:text-black/70"
            >
              <X size={18} />
            </button>
          </header>

          <nav
            aria-label="设置分类"
            className="flex gap-1 overflow-x-auto border-b border-black/8 px-2 py-2 md:hidden"
          >
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const selected = id === section;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={selected ? 'true' : undefined}
                  className={`focus-ring flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                    selected
                      ? 'bg-[#176b61]/10 font-medium text-[#176b61]'
                      : 'text-black/55 hover:bg-black/[0.04]'
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  {label}
                </button>
              );
            })}
          </nav>

          {/*
            Panels stay mounted and are only hidden: restore progress, typed
            engine names and the background error then survive a tab switch.
          */}
          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div hidden={active.id !== 'sync'}>
              <SyncPanel
                user={user}
                sessionError={sessionError}
                uploading={uploading}
                lastUpload={lastUpload}
                bookmarks={bookmarks}
                uploadTick={uploadTick}
                onUpload={onUpload}
                onConnect={onConnect}
                onRefreshSession={onRefreshSession}
                onUnlink={onUnlink}
                onPauseRefresh={onPauseRefresh}
                onResumeRefresh={onResumeRefresh}
              />
            </div>
            <div hidden={active.id !== 'appearance'}>
              <AppearancePanel settings={settings} onSettings={onSettings} />
            </div>
            <div hidden={active.id !== 'search'}>
              <SearchPanel settings={settings} onSettings={onSettings} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
