import { browser } from 'wxt/browser';
import { backend, LOCAL_ONLY_MESSAGE } from './backend';
import { SITE_BASE } from './constants';
import {
  clearExtensionToken,
  clearPendingLink,
  loadPendingLink,
  saveExtensionToken,
  savePendingLink,
} from './storage';
import type { User } from './types';

/** Matches the server's 10 minute window, plus a little slack. */
const PENDING_LINK_MAX_AGE = 15 * 60 * 1000;

function createLinkState(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Start the connection handshake.
 *
 * The web app is the identity provider: it opens `/extension-auth?state=...`,
 * the signed-in user approves, and `completePendingLink` trades that state for a
 * token. Nothing here reads the web session cookie, so the extension no longer
 * needs the `cookies` permission.
 */
export async function beginExtensionLink(): Promise<void> {
  if (!backend.supportsAccount) throw new Error(LOCAL_ONLY_MESSAGE);
  const state = createLinkState();
  await savePendingLink(state);
  await browser.tabs.create({ url: `${SITE_BASE}/extension-auth?state=${state}` });
}

/**
 * Finish a pending handshake if the web side approved it.
 * Returns the linked user, or null when there is nothing pending yet.
 */
export async function completePendingLink(): Promise<User | null> {
  const pending = await loadPendingLink();
  if (!pending) return null;
  if (Date.now() - pending.createdAt > PENDING_LINK_MAX_AGE) {
    await clearPendingLink();
    return null;
  }

  const result = await backend.claim(pending.state);
  if (!result) return null;

  await saveExtensionToken(result.token);
  await clearPendingLink();
  return result.user;
}

/** Forget this device's token. The web session is intentionally left alone. */
export async function unlinkExtension(): Promise<void> {
  await clearExtensionToken();
  await clearPendingLink();
}
