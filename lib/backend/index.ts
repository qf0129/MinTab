import { createHttpBackend } from './http';
import { createLocalBackend } from './local';

/**
 * Which backend this build talks to.
 *
 * `WXT_BACKEND=local` produces an offline-only build (see README); anything
 * else, including unset, uses the HTTP backend configured by `WXT_SITE_BASE`.
 */
const kind = import.meta.env.WXT_BACKEND === 'local' ? 'local' : 'http';

export const backend = kind === 'local' ? createLocalBackend() : createHttpBackend();

export type { SessionState, SyncBackend, UploadResult, UploadSummary } from './contract';
export { LOCAL_ONLY_MESSAGE } from './contract';
