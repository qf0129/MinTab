import { Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { countBookmarks, removeFolderNode, renameFolderNode } from '../lib/browser-bookmarks';
import type { BrowserBookmarkNode } from '../lib/types';

interface Props {
  node: BrowserBookmarkNode;
  onClose: () => void;
  onChanged: () => void;
}

export function FolderEditDialog({ node, onClose, onChanged }: Props) {
  const [name, setName] = useState(node.title);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const total = countBookmarks(node);

  useEffect(() => {
    setName(node.title);
    setError('');
    setConfirmingDelete(false);
  }, [node]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      setError('请输入文件夹名称');
      return;
    }
    setBusy(true);
    try {
      await renameFolderNode(node.id, nextName);
      onChanged();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setBusy(true);
    try {
      await removeFolderNode(node.id);
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
        aria-label="关闭文件夹对话框"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="surface relative w-full max-w-sm rounded-lg bg-white p-5"
        aria-label="编辑文件夹"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">编辑文件夹</h2>
            <p className="mt-1 text-xs text-black/40">{total} 个书签</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded p-1 text-black/45 hover:bg-black/5"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <label className="block text-xs font-medium text-black/60">
          文件夹名称
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
            className="mt-1.5 w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#26734d]"
          />
        </label>
        <p className="mt-2 min-h-5 text-xs text-red-600">{error}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="focus-ring flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={15} />
            {confirmingDelete ? '确认删除文件夹及其书签' : '删除文件夹'}
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
