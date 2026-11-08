import { ChevronDown, ChevronRight, Folder, Loader2, Settings as SettingsIcon } from 'lucide-react';
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BookmarkBoard } from '../../components/BookmarkBoard';
import { BookmarkDialogHost } from '../../components/BookmarkDialogHost';
import { useBrowserBookmarks } from '../../hooks/use-browser-bookmarks';
import { useCollapsedGroups } from '../../hooks/use-collapsed-groups';
import { useSettings } from '../../hooks/use-settings';
import { backend } from '../../lib/backend';
import {
  countBookmarks,
  moveBookmarkNode,
  rootFolders,
  subfolderGroups,
  visibleGroups,
} from '../../lib/browser-bookmarks';
import {
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND_PRESET,
  SEARCH_ENGINES,
  type Theme,
  themeFor,
} from '../../lib/constants';
import { beginExtensionLink, completePendingLink, unlinkExtension } from '../../lib/link';
import { loadLastUpload } from '../../lib/storage';
import type { BrowserBookmarkNode, User } from '../../lib/types';
import { SettingsDialog } from './settings/SettingsDialog';

/**
 * Bookmark URLs come from the browser profile, not from us: only navigate to
 * schemes a page is allowed to open. Privileged or script URLs are ignored
 * instead of being handed to `location.assign`.
 */
function openUrl(node: BrowserBookmarkNode): void {
  if (!node.url) return;
  try {
    const parsed = new URL(node.url);
    if (!['http:', 'https:', 'ftp:'].includes(parsed.protocol)) return;
    window.location.assign(parsed.href);
  } catch {
    // Malformed URL: nothing sensible to open.
  }
}

/** DOM id of the inline group rendered for a folder. */
function folderAnchorId(id: string): string {
  return `folder-${id}`;
}

interface GroupHeaderProps {
  title: string;
  count: number;
  collapsed: boolean;
  theme: Theme;
  highlighted?: boolean;
  onToggle: () => void;
}

/** Clickable section/group title that collapses its list on click. */
function GroupHeader({
  title,
  count,
  collapsed,
  theme,
  highlighted = false,
  onToggle,
}: GroupHeaderProps) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      title={collapsed ? `展开「${title}」` : `折叠「${title}」`}
      className="focus-ring group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs font-semibold transition hover:brightness-105"
      style={highlighted ? { background: theme.accentSoft } : undefined}
    >
      <Chevron size={14} className="shrink-0 opacity-50 transition group-hover:opacity-90" />
      <Folder size={14} className="shrink-0" style={{ color: theme.accentSolid }} />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums opacity-55"
        style={{ border: `1px solid ${theme.line}` }}
      >
        {count}
      </span>
    </button>
  );
}

export function NewTabApp() {
  const { settings, loading, updateSettings } = useSettings();
  const { tree, loading: bookmarksLoading, refresh, pause, resume } = useBrowserBookmarks();
  const { collapsed, toggle, expand } = useCollapsedGroups();
  const [user, setUser] = useState<User | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastUpload, setLastUpload] = useState<number | null>(null);
  /** Bumped after each successful upload so the restore list re-fetches. */
  const [uploadTick, setUploadTick] = useState(0);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<BrowserBookmarkNode | null>(null);
  const [jumpedTo, setJumpedTo] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const jumpTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);

  /**
   * A folder card scrolls down to the inline group rendered for that folder.
   * Expand the collapsed ancestors first, then scroll once they are on screen.
   */
  const rootByFolder = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (node: BrowserBookmarkNode, rootId: string) => {
      map.set(node.id, rootId);
      for (const child of node.children ?? []) walk(child, rootId);
    };
    for (const folder of rootFolders(tree)) walk(folder, folder.id);
    return map;
  }, [tree]);

  const scrollToFolder = useCallback(
    (node: BrowserBookmarkNode) => {
      const rootId = rootByFolder.get(node.id);
      expand(rootId && rootId !== node.id ? [rootId, node.id] : [node.id]);
      setPendingJump(node.id);
    },
    [expand, rootByFolder]
  );

  useEffect(() => {
    if (!pendingJump) return;
    const target = document.getElementById(folderAnchorId(pendingJump));
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setJumpedTo(pendingJump);
    setPendingJump(null);
    if (jumpTimer.current !== null) window.clearTimeout(jumpTimer.current);
    jumpTimer.current = window.setTimeout(() => setJumpedTo(null), 1600);
  }, [pendingJump]);

  useEffect(
    () => () => {
      if (jumpTimer.current !== null) window.clearTimeout(jumpTimer.current);
    },
    []
  );

  /**
   * Pick up a finished connection handshake, then re-read the stored token.
   *
   * The approval happens in another tab, so this runs on focus/visibility: after
   * the user approves and switches back, the pending state is exchanged for a
   * token and the dialog flips to the logged-in state without any extra click.
   */
  const refreshSession = useCallback(async () => {
    try {
      const linked = await completePendingLink();
      if (linked) {
        setUser(linked);
        setSessionError('');
        return;
      }
    } catch {
      // Fall through to the normal probe; a failed claim is not a broken session.
    }

    const state = await backend.me();
    if (state.status === 'authenticated') {
      setUser(state.user);
      setSessionError('');
    } else if (state.status === 'anonymous') {
      setUser(null);
      setSessionError('');
    } else {
      // Keep any known user; surface the failure instead of pretending to be logged out.
      setSessionError(state.message);
    }
  }, []);

  /** Open the web app so the user can approve this installation. */
  const connectAccount = async () => {
    try {
      await beginExtensionLink();
      notify('已打开授权页，在网页端点击“允许连接”后切回本标签页');
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法打开授权页');
    }
  };

  useEffect(() => {
    void Promise.all([refreshSession(), loadLastUpload()]).then(([, uploadedAt]) => {
      setLastUpload(uploadedAt);
    });
  }, [refreshSession]);

  useEffect(() => {
    const onFocus = () => void refreshSession();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshSession();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshSession]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast('');
    }, 2600);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    []
  );

  const engines = useMemo(
    () => [...SEARCH_ENGINES, ...(settings?.customSearchEngines ?? [])],
    [settings?.customSearchEngines]
  );
  const selectedEngine = engines.find((engine) => engine.id === settings?.searchEngine) ?? {
    id: 'google',
    name: 'Google',
    url: 'https://www.google.com/search?q={query}',
  };
  const theme: Theme = themeFor(settings?.cardOpacity ?? 'medium');
  const preset =
    BACKGROUND_PRESETS.find((item) => item.id === settings?.backgroundPreset) ??
    DEFAULT_BACKGROUND_PRESET;
  const hasImage = Boolean(settings?.backgroundImage);
  /**
   * The page background is always expressed through longhands. Mixing the
   * `background` shorthand with `background-image` breaks on re-render: React
   * only re-applies properties whose value changed, and assigning the shorthand
   * resets every longhand, so the picture vanished until the tab was reloaded.
   */
  const pageStyle: CSSProperties = {
    backgroundImage: hasImage ? `url(${settings?.backgroundImage ?? ''})` : preset.backgroundImage,
    backgroundColor: preset.backgroundColor,
    backgroundPosition: 'center',
    backgroundSize: hasImage ? 'cover' : (preset.backgroundSize ?? 'auto'),
    backgroundRepeat: hasImage ? 'no-repeat' : (preset.backgroundRepeat ?? 'no-repeat'),
    backgroundAttachment: 'fixed',
    color: theme.fg,
  };
  // The decorative glows belong to the default gradient; patterns and photos
  // should show their own texture instead.
  const showGlows = !hasImage && preset.id === DEFAULT_BACKGROUND_PRESET.id;
  const glassStyle: CSSProperties = {
    background: theme.chip,
    color: theme.fg,
    border: `1px solid ${theme.line}`,
    boxShadow: '0 18px 40px rgb(15 40 38 / 12%)',
    backdropFilter: 'blur(14px)',
  };
  const roots = useMemo(
    () => rootFolders(tree).filter((folder) => (folder.children?.length ?? 0) > 0),
    [tree]
  );

  const search = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    window.location.assign(
      selectedEngine.url.replaceAll('{query}', encodeURIComponent(query.trim()))
    );
  };

  const doUpload = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const result = await backend.upload();
      setLastUpload(result.uploadedAt);
      setUploadTick((value) => value + 1);
      notify(
        result.removed > 0
          ? `已上传 ${result.count} 条书签，自动清理了 ${result.removed} 条旧快照`
          : `已上传 ${result.count} 条书签`
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : '上传失败');
      void refreshSession();
    } finally {
      setUploading(false);
    }
  };

  /** Persist a card that was dropped at a new position in its folder. */
  const moveBookmark = async (
    node: BrowserBookmarkNode,
    oldIndex: number,
    newIndex: number
  ): Promise<void> => {
    try {
      await moveBookmarkNode(node.id, oldIndex, newIndex);
    } catch (error) {
      notify(error instanceof Error ? error.message : '移动失败');
      // Let the board roll its optimistic order back.
      throw error;
    }
    void refresh();
  };

  if (!settings || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#e3e6e9] text-sm text-black/45">
        加载中…
      </div>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden transition-colors" style={pageStyle}>
      {/*
        Every text surface is a light card; the scrim only softens the photo so
        the page does not turn into a random patchwork of bright cards.
      */}
      {settings.backgroundImage && (
        <div aria-hidden className="pointer-events-none fixed inset-0 bg-[#e3e6e9]/10" />
      )}
      {showGlows && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <span
            className="absolute -left-40 -top-48 size-[34rem] rounded-full blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.5), transparent 68%)',
            }}
          />
          <span
            className="absolute -bottom-56 -right-32 size-[40rem] rounded-full opacity-70 blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(72, 82, 94, 0.18), transparent 70%)',
            }}
          />
        </div>
      )}

      <div className="relative mx-auto max-w-[1320px] px-5 py-6 max-sm:px-3">
        <header className="relative mb-6 flex min-h-14 items-center justify-end gap-4">
          {settings.searchEnabled && (
            <form
              onSubmit={search}
              className="absolute inset-x-36 mx-auto grid h-12 max-w-3xl grid-cols-[120px_minmax(0,1fr)_72px] overflow-hidden rounded-full max-lg:static max-lg:min-w-0 max-lg:flex-1 max-sm:grid-cols-[92px_minmax(0,1fr)]"
              style={glassStyle}
            >
              <select
                value={selectedEngine.id}
                onChange={(event) => updateSettings({ searchEngine: event.target.value })}
                className="min-w-0 bg-transparent text-center text-sm outline-none"
              >
                {engines.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))}
              </select>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`使用 ${selectedEngine.name} 搜索`}
                className="min-w-0 bg-transparent px-4 text-sm outline-none placeholder:opacity-55"
              />
              <button
                type="submit"
                className="text-sm font-medium text-white transition hover:brightness-110 max-sm:hidden"
                style={{ background: theme.accent }}
              >
                搜索
              </button>
            </form>
          )}
          <nav className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(true);
                void refreshSession();
              }}
              className="focus-ring flex size-10 items-center justify-center rounded-full transition hover:brightness-105"
              style={{ background: theme.chip, border: `1px solid ${theme.line}` }}
              title="设置"
            >
              <SettingsIcon size={19} />
            </button>
          </nav>
        </header>

        {bookmarksLoading ? (
          <div
            className="mx-auto mt-10 flex max-w-md items-center justify-center gap-2 rounded-2xl px-6 py-10 text-sm"
            style={{ background: theme.chip, border: `1px solid ${theme.line}` }}
          >
            <Loader2 size={16} className="animate-spin" />
            正在读取浏览器书签…
          </div>
        ) : roots.length === 0 ? (
          <div
            className="mx-auto mt-10 flex max-w-md flex-col items-center rounded-2xl px-6 py-14 text-center text-sm opacity-70"
            style={{ background: theme.chip, border: `1px solid ${theme.line}` }}
          >
            浏览器中还没有书签，先在浏览器里添加一些吧。
          </div>
        ) : (
          roots.map((root) => {
            const groups = visibleGroups(subfolderGroups(root), collapsed);
            const rootCollapsed = collapsed.has(root.id);
            return (
              <section key={root.id} className="mb-5">
                <div
                  className="rounded-md p-2 backdrop-blur-md"
                  style={{ background: theme.folder, border: `1px solid ${theme.line}` }}
                >
                  <GroupHeader
                    title={root.title || '书签'}
                    count={countBookmarks(root)}
                    collapsed={rootCollapsed}
                    theme={theme}
                    onToggle={() => toggle(root.id)}
                  />
                  {!rootCollapsed && (
                    <div className="mt-2">
                      <BookmarkBoard
                        nodes={root.children ?? []}
                        size={settings.newTabBookmarkSize}
                        cardColor={theme.chip}
                        cardBorder={theme.line}
                        accentColor={theme.accentSolid}
                        onOpen={openUrl}
                        onOpenFolder={scrollToFolder}
                        onEdit={setEditing}
                        onMove={moveBookmark}
                      />
                    </div>
                  )}
                </div>
                {!rootCollapsed && groups.length > 0 && (
                  <div className="mt-4 space-y-4">
                    {groups.map((group) => {
                      const groupCollapsed = collapsed.has(group.folder.id);
                      const highlighted = jumpedTo === group.folder.id;
                      return (
                        <div
                          key={group.folder.id}
                          id={folderAnchorId(group.folder.id)}
                          className="scroll-mt-6 rounded-md p-2 backdrop-blur-md transition-shadow"
                          style={{
                            background: theme.folder,
                            border: `1px solid ${theme.line}`,
                            boxShadow: highlighted ? `0 0 0 2px ${theme.accentSoft}` : undefined,
                          }}
                        >
                          <GroupHeader
                            title={group.title}
                            count={countBookmarks(group.folder)}
                            collapsed={groupCollapsed}
                            theme={theme}
                            highlighted={highlighted}
                            onToggle={() => toggle(group.folder.id)}
                          />
                          {!groupCollapsed && (
                            <div className="mt-2">
                              <BookmarkBoard
                                nodes={group.nodes}
                                size={settings.newTabBookmarkSize}
                                cardColor={theme.chip}
                                cardBorder={theme.line}
                                accentColor={theme.accentSolid}
                                onOpen={openUrl}
                                onOpenFolder={scrollToFolder}
                                onEdit={setEditing}
                                onMove={moveBookmark}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      <BookmarkDialogHost
        node={editing}
        onClose={() => setEditing(null)}
        onChanged={() => void refresh()}
      />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        user={user}
        sessionError={sessionError}
        uploading={uploading}
        lastUpload={lastUpload}
        bookmarks={tree}
        uploadTick={uploadTick}
        onClose={() => setSettingsOpen(false)}
        onSettings={updateSettings}
        onRefreshSession={() => void refreshSession()}
        onUpload={() => void doUpload()}
        onConnect={() => void connectAccount()}
        onUnlink={async () => {
          await unlinkExtension();
          setUser(null);
          setSessionError('');
          notify('已断开连接，网页版登录状态不受影响');
        }}
        onPauseRefresh={pause}
        onResumeRefresh={resume}
      />
      <div
        className={`fixed bottom-8 left-1/2 z-[120] -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white transition ${toast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
        style={{ background: 'linear-gradient(135deg, #202124, #3c4644)' }}
        aria-live="polite"
      >
        {toast}
      </div>
    </main>
  );
}
