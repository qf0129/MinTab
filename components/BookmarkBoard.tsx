import { Folder, Globe, Pencil } from 'lucide-react';
import { useRef, useState } from 'react';
import { ReactSortable, type SortableEvent } from 'react-sortablejs';
import { countBookmarks, isFolder } from '../lib/browser-bookmarks';
import { faviconUrl, hostnameOf } from '../lib/favicon';
import type { BrowserBookmarkNode } from '../lib/types';

interface Props {
  nodes: BrowserBookmarkNode[];
  size?: 'small' | 'medium' | 'large';
  /** Gradient (or colour) painted on every card. */
  cardColor?: string;
  /** Hairline border colour that matches the active theme. */
  cardBorder?: string;
  /** Solid accent used by folder icons and the folder count chip. */
  accentColor?: string;
  emptyText?: string;
  onOpen: (node: BrowserBookmarkNode) => void;
  onOpenFolder: (node: BrowserBookmarkNode) => void;
  onEdit: (node: BrowserBookmarkNode) => void;
  /**
   * Persist that `node` was dropped at `newIndex` (the position it occupies
   * once `oldIndex` has been removed). Reject when the move could not be saved,
   * so the board can put its optimistic order back.
   */
  onMove?: (node: BrowserBookmarkNode, oldIndex: number, newIndex: number) => Promise<void>;
}

const COLUMNS: Record<NonNullable<Props['size']>, string> = {
  small: 'grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]',
  medium: 'grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]',
  large: 'grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]',
};

/** How long SortableJS takes to slide the neighbouring cards into place. */
const DRAG_ANIMATION_MS = 150;

interface CardProps {
  node: BrowserBookmarkNode;
  size: NonNullable<Props['size']>;
  cardColor?: string;
  cardBorder?: string;
  accentColor?: string;
  onOpen: Props['onOpen'];
  onOpenFolder: Props['onOpenFolder'];
  onEdit: Props['onEdit'];
  /** Injected by `react-sortablejs`; carries the sortable state classes. */
  className?: string;
  'data-id'?: string | number;
}

/** One card. The whole card is the drag source, but stays clickable as well. */
function BookmarkCard({
  node,
  size,
  cardColor,
  cardBorder,
  accentColor,
  onOpen,
  onOpenFolder,
  onEdit,
  className,
  'data-id': dataId,
}: CardProps) {
  const folder = isFolder(node);
  const title = node.title || node.url || '未命名';
  const count = folder ? countBookmarks(node) : 0;
  const label = folder ? `${title}(${count})` : title;
  return (
    <div
      data-id={dataId}
      style={{
        background: cardColor ?? 'rgba(255, 255, 255, 0.6)',
        ...(cardBorder ? { border: `1px solid ${cardBorder}` } : {}),
      }}
      className={`group relative flex min-w-0 cursor-grab items-center gap-1 rounded-md px-2 py-1.5 backdrop-blur-md shadow-[0_1px_2px_rgba(15,40,38,0.05)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(15,40,38,0.12)] ${
        className ?? ''
      }`}
    >
      <button
        type="button"
        onClick={() => (folder ? onOpenFolder(node) : onOpen(node))}
        title={folder ? `${title}(${count} 个书签)` : `${title} | ${node.url}`}
        aria-label={label}
        className="focus-ring flex min-w-0 flex-1 cursor-grab items-center gap-2 text-left"
      >
        {folder ? (
          <Folder size={20} className="size-5.5 shrink-0 py-0.5" style={{ color: accentColor }} />
        ) : (
          <img
            src={faviconUrl(node.url ?? '')}
            alt=""
            className="size-5 shrink-0 rounded object-contain p-0.5"
            onError={(event) => {
              event.currentTarget.style.visibility = 'hidden';
            }}
          />
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{label}</span>
          {!folder && size === 'large' && (
            <span className="block truncate text-xs opacity-55">{hostnameOf(node.url ?? '')}</span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(node);
        }}
        className="focus-ring absolute right-1.5 top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-lg bg-white/90 text-[#1f2928] opacity-0 shadow-sm transition group-hover:opacity-100"
        title={folder ? '编辑文件夹' : '编辑书签'}
        aria-label={`编辑 ${title}`}
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}

/** Renders a folder's direct children as a grid of draggable folder and bookmark cards. */
export function BookmarkBoard({
  nodes,
  size = 'medium',
  cardColor,
  cardBorder,
  accentColor,
  emptyText = '此文件夹暂无内容',
  onOpen,
  onOpenFolder,
  onEdit,
  onMove,
}: Props) {
  // The browser stays the source of truth, but a finished drag has to show its
  // result right away instead of after the round trip that persists it. Keep
  // only the id order here, so titles still come from the freshest tree.
  const signature = nodes.map((node) => node.id).join(',');
  const [order, setOrder] = useState<string[]>(() => nodes.map((node) => node.id));
  const lastSignature = useRef(signature);
  if (lastSignature.current !== signature) {
    lastSignature.current = signature;
    setOrder(nodes.map((node) => node.id));
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const items = order
    .map((id) => byId.get(id))
    .filter((node): node is BrowserBookmarkNode => node !== undefined);

  if (!items.length) {
    return (
      <div className="flex min-h-32 items-center justify-center gap-2 rounded-lg text-sm opacity-50">
        <Globe size={16} />
        {emptyText}
      </div>
    );
  }

  /** SortableJS hands us its list in the new DOM order; ignore flag churn. */
  const applyList = (next: BrowserBookmarkNode[]): void => {
    const nextIds = next.map((node) => node.id);
    if (nextIds.join(',') === order.join(',')) return;
    setOrder(nextIds);
  };

  /** `onUpdate` fires on drop, before `setList`, so `items` is still the old order. */
  const handleUpdate = (event: SortableEvent): void => {
    const oldIndex = event.oldIndex ?? -1;
    const newIndex = event.newIndex ?? -1;
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const previousIds = items.map((node) => node.id);
    const moved = items[oldIndex];
    if (!moved || !onMove) return;
    onMove(moved, oldIndex, newIndex).catch(() => setOrder(previousIds));
  };

  return (
    <ReactSortable
      list={items}
      setList={applyList}
      className={`grid ${COLUMNS[size]} gap-2`}
      animation={DRAG_ANIMATION_MS}
      disabled={!onMove}
      // On touch screens a long press drags, a normal swipe still scrolls.
      delay={200}
      delayOnTouchOnly
      // Every board is its own list: releasing outside this folder is not a
      // move, so pulling a card into another board stays disabled.
      group={{ name: 'mintab-bookmarks', pull: false, put: false }}
      onUpdate={handleUpdate}
    >
      {items.map((node) => (
        <BookmarkCard
          key={node.id}
          node={node}
          size={size}
          cardColor={cardColor}
          cardBorder={cardBorder}
          accentColor={accentColor}
          onOpen={onOpen}
          onOpenFolder={onOpenFolder}
          onEdit={onEdit}
        />
      ))}
    </ReactSortable>
  );
}
