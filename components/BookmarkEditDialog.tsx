import { Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { removeBookmarkNode, updateBookmarkNode } from '../lib/browser-bookmarks';
import type { BrowserBookmarkNode } from '../lib/types';

interface Props {
  node: BrowserBookmarkNode;
  onClose: () => void;
  onChanged: () => void;
}

export function BookmarkEditDialog({ node, onClose, onChanged }: Props) {
  const [title, setTitle] = useState(node.title);
  const [url, setUrl] = useState(node.url ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(node.title);
    setUrl(node.url ?? '');
    setError('');
  }, [node]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextUrl = url.trim();
    try {
      const parsed = new URL(nextUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      setError('请输入有效的 HTTP(S) 链接');
      return;
    }
    setBusy(true);
    try {
      await updateBookmarkNode(node.id, { title: title.trim() || nextUrl, url: nextUrl });
      onChanged();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('确认删除这个书签？')) return;
    setBusy(true);
    try {
      await removeBookmarkNode(node.id);
      onChanged();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除失败');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/35 p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭书签对话框"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="surface relative w-full max-w-sm rounded-lg bg-white p-5"
        aria-label="编辑书签"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">编辑书签</h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded p-1 text-black/45 hover:bg-black/5"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <label className="mb-3 block text-xs font-medium text-black/60">
          标题
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1.5 w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#26734d]"
          />
        </label>
        <label className="mb-2 block text-xs font-medium text-black/60">
          链接
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
            className="mt-1.5 w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#26734d]"
          />
        </label>
        <p className="min-h-5 text-xs text-red-600">{error}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="focus-ring flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={15} />
            删除
          </button>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="focus-ring rounded-md border border-black/12 px-4 py-2 text-sm hover:bg-black/4"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={busy}
              className="focus-ring rounded-md bg-[#26734d] px-4 py-2 text-sm font-medium text-white hover:bg-[#1f6140] disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
