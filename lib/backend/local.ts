import type { SnapshotNode } from '../bookmark-transfer';
import type { User } from '../types';
import { LOCAL_ONLY_MESSAGE, type SessionState, type SyncBackend } from './contract';

const unsupported = (): never => {
  throw new Error(LOCAL_ONLY_MESSAGE);
};

/**
 * Build-time opt-out (`WXT_BACKEND=local`): every bookmark feature keeps
 * working, but the extension never performs a network request and all account
 * UI is replaced by an explanatory note.
 *
 * This is what forks that do not run a compatible server should ship.
 */
export function createLocalBackend(): SyncBackend {
  return {
    kind: 'local',
    supportsAccount: false,

    async me(): Promise<SessionState> {
      return { status: 'anonymous' };
    },

    async upload(): Promise<never> {
      return unsupported();
    },

    async listUploads(): Promise<never> {
      return unsupported();
    },

    async getSnapshot(): Promise<SnapshotNode[]> {
      return unsupported();
    },

    async claim(): Promise<{ token: string; user: User } | null> {
      return null;
    },
  };
}
