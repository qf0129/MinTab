import type { SnapshotNode } from '../bookmark-transfer';
import type { User } from '../types';

/**
 * The sync backend contract.
 *
 * The UI only talks to this interface, so a build can ship three different
 * shapes without touching a component:
 *
 * - `http`  — any server implementing `docs/api-contract.md` (the default).
 * - `local` — no account features at all; bookmarks never leave the browser.
 *
 * Adding a third implementation (self-hosted proxy, local file sync, …) means
 * writing one more factory in this directory and selecting it in `index.ts`.
 */
export interface SyncBackend {
  readonly kind: 'http' | 'local';
  /** False for builds where account features are not available at all. */
  readonly supportsAccount: boolean;

  /**
   * Probe the stored token. Must resolve (`{ status: 'error' }` on a transient
   * failure) instead of throwing: it runs on every new tab and drives whether
   * the UI offers a "connect" button.
   */
  me(): Promise<SessionState>;

  /** Upload the current bookmark tree. Throws with a user-facing message. */
  upload(): Promise<UploadResult>;

  /** Cloud snapshots for the account, newest first. Throws on failure. */
  listUploads(limit: number): Promise<UploadSummary[]>;

  /** Raw bookmark tree of one snapshot. Throws on failure. */
  getSnapshot(id: number): Promise<SnapshotNode[]>;

  /** Trade the one-time handshake state for a device token. */
  claim(state: string): Promise<{ token: string; user: User } | null>;
}

export type SessionState =
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous' }
  | { status: 'error'; message: string };

export interface UploadResult {
  count: number;
  uploadedAt: number;
  /** Old snapshots the server trimmed to keep a Free account within its quota. */
  removed: number;
}

export interface UploadSummary {
  id: number;
  device_id: string;
  browser: string;
  browser_version: string;
  entry_count: number;
  created_at: number;
}

/** User-facing explanation shown by local-only builds. */
export const LOCAL_ONLY_MESSAGE = '当前构建为纯本地模式，未启用账号同步';
