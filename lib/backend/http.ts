import { browser } from 'wxt/browser';
import type { SnapshotNode } from '../bookmark-transfer';
import { getDeviceInfo } from '../device';
import { type MessageKey, t } from '../i18n';
import { loadExtensionToken, saveLastUpload } from '../storage';
import { request } from '../transport';
import type { BrowserBookmarkNode, User } from '../types';
import type { SessionState, SyncBackend, UploadResult, UploadSummary } from './contract';

/**
 * Turn a failed transport response into the message the UI shows.
 *
 * The server's own `error` string is passed through (it is written by whoever
 * operates the backend, in their language); transport-level failures are
 * translated locally.
 */
function failureMessage(
  response: { status: number; data: { error?: string } },
  fallback: MessageKey
): string {
  if (response.status === 0) return t('error_network');
  return response.data?.error || `${t(fallback)} (${response.status})`;
}

/**
 * The default backend: any server that implements `docs/api-contract.md`.
 *
 * The base URL is baked in at build time (`WXT_SITE_BASE`) — see README.
 */
export function createHttpBackend(): SyncBackend {
  return {
    kind: 'http',
    supportsAccount: true,

    async me(): Promise<SessionState> {
      const token = await loadExtensionToken();
      if (!token) return { status: 'anonymous' };

      const response = await request<User>('/api/auth/me');
      if (response.ok && typeof response.data?.id === 'number') {
        return { status: 'authenticated', user: response.data };
      }
      if (response.status === 401) return { status: 'anonymous' };
      return { status: 'error', message: failureMessage(response, 'error_requestFailed') };
    },

    async upload(): Promise<UploadResult> {
      const bookmarks = (await browser.bookmarks.getTree()) as unknown as BrowserBookmarkNode[];
      const device = await getDeviceInfo();
      const response = await request<{ count: number; uploadedAt: number; removed?: number }>(
        '/api/upload',
        'POST',
        {
          device,
          bookmarks,
          exportedAt: Date.now(),
        }
      );
      if (!response.ok) throw new Error(failureMessage(response, 'error_uploadFailed'));
      await saveLastUpload(response.data.uploadedAt);
      return {
        count: response.data.count,
        uploadedAt: response.data.uploadedAt,
        removed: response.data.removed ?? 0,
      };
    },

    async listUploads(limit: number): Promise<UploadSummary[]> {
      const response = await request<{ uploads: UploadSummary[] }>(`/api/uploads?limit=${limit}`);
      if (!response.ok) throw new Error(failureMessage(response, 'error_historyFailed'));
      return response.data.uploads ?? [];
    },

    async getSnapshot(id: number): Promise<SnapshotNode[]> {
      const response = await request<{ data?: SnapshotNode[] }>(`/api/uploads/${id}`);
      if (!response.ok || !Array.isArray(response.data?.data)) {
        throw new Error(failureMessage(response, 'error_snapshotFailed'));
      }
      return response.data.data;
    },

    async claim(state: string): Promise<{ token: string; user: User } | null> {
      const response = await request<{ token?: string; user?: User }>(
        '/api/auth/extension/claim',
        'POST',
        { state }
      );
      const { token, user } = response.data ?? {};
      if (!response.ok || !token || !user) return null;
      return { token, user };
    },
  };
}
