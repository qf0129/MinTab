import { browser } from 'wxt/browser';
import { SITE_BASE } from '../lib/constants';
import { loadExtensionToken } from '../lib/storage';

async function requestApi(path: string, method = 'GET', body?: unknown) {
  try {
    // The extension authenticates with the token issued by the web handshake.
    // No cookies are read or sent, so `cookies` is not a required permission.
    const token = await loadExtensionToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${SITE_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: '无法连接服务器' } };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    const value = message as { type?: string; path?: string; method?: string; body?: unknown };
    if (value.type === 'api' && value.path) return requestApi(value.path, value.method, value.body);
    return undefined;
  });

  // The toolbar button has no popup; it opens the new tab page instead.
  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL('/newtab.html') });
  });
});
