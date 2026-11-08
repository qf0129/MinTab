import { browser } from 'wxt/browser';
import {
  COLLAPSED_GROUPS_KEY,
  DEFAULT_SETTINGS,
  DEVICE_ID_KEY,
  EXTENSION_TOKEN_KEY,
  LAST_UPLOAD_KEY,
  PENDING_LINK_KEY,
  SETTINGS_KEY,
} from './constants';
import type { Settings } from './types';
import { compactUuid } from './utils';

export async function loadSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...((result[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {}),
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const settings = { ...(await loadSettings()), ...patch };
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export async function loadLastUpload(): Promise<number | null> {
  const result = await browser.storage.local.get(LAST_UPLOAD_KEY);
  return typeof result[LAST_UPLOAD_KEY] === 'number' ? result[LAST_UPLOAD_KEY] : null;
}

export async function saveLastUpload(uploadedAt: number): Promise<void> {
  await browser.storage.local.set({ [LAST_UPLOAD_KEY]: uploadedAt });
}

/**
 * Group ids the user collapsed on the new tab page. Stored as a plain string
 * list so a single `browser.storage.local` write keeps every open new tab in
 * sync through `storage.onChanged`.
 */
export async function loadCollapsedGroups(): Promise<string[]> {
  const result = await browser.storage.local.get(COLLAPSED_GROUPS_KEY);
  const stored = result[COLLAPSED_GROUPS_KEY];
  return Array.isArray(stored)
    ? stored.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
}

export async function saveCollapsedGroups(ids: string[]): Promise<void> {
  await browser.storage.local.set({ [COLLAPSED_GROUPS_KEY]: ids });
}

/** Stable per-installation device id, generated on first use. */
export async function loadDeviceId(): Promise<string> {
  const result = await browser.storage.local.get(DEVICE_ID_KEY);
  const stored = result[DEVICE_ID_KEY];
  if (typeof stored === 'string' && stored) return stored;
  const id = compactUuid();
  await browser.storage.local.set({ [DEVICE_ID_KEY]: id });
  return id;
}

/** Token issued by the web app handshake; the extension's only credential. */
export async function loadExtensionToken(): Promise<string | null> {
  const result = await browser.storage.local.get(EXTENSION_TOKEN_KEY);
  const stored = result[EXTENSION_TOKEN_KEY];
  return typeof stored === 'string' && stored ? stored : null;
}

export async function saveExtensionToken(token: string): Promise<void> {
  await browser.storage.local.set({ [EXTENSION_TOKEN_KEY]: token });
}

export async function clearExtensionToken(): Promise<void> {
  await browser.storage.local.remove(EXTENSION_TOKEN_KEY);
}

export interface PendingLink {
  state: string;
  createdAt: number;
}

/** Handshake state generated before opening the web approval page. */
export async function loadPendingLink(): Promise<PendingLink | null> {
  const result = await browser.storage.local.get(PENDING_LINK_KEY);
  const stored = result[PENDING_LINK_KEY] as Partial<PendingLink> | undefined;
  if (!stored || typeof stored.state !== 'string' || typeof stored.createdAt !== 'number') {
    return null;
  }
  return { state: stored.state, createdAt: stored.createdAt };
}

export async function savePendingLink(state: string): Promise<void> {
  await browser.storage.local.set({ [PENDING_LINK_KEY]: { state, createdAt: Date.now() } });
}

export async function clearPendingLink(): Promise<void> {
  await browser.storage.local.remove(PENDING_LINK_KEY);
}
