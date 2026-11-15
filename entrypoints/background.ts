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

  // The toolbar button opens the browser's native side panel (Chrome/Edge).
  // Chromium handles the click itself once this behavior is set, so no
  // `action.onClicked` listener is needed there.
  void browser.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.warn('[mintab] side panel unavailable', error));

  // Firefox has no `sidePanel` namespace; WXT maps the entrypoint to
  // `sidebar_action`, whose toolbar button has to be opened explicitly. MV2
  // exposes the button as `browserAction`, MV3 as `action`.
  const sidebarAction = (browser as unknown as { sidebarAction?: { open: () => Promise<void> } })
    .sidebarAction;
  const toolbarAction =
    browser.action ??
    (browser as unknown as { browserAction?: typeof browser.action }).browserAction;
  if (sidebarAction && toolbarAction) {
    toolbarAction.onClicked.addListener(() => {
      void sidebarAction.open();
    });
  }
});
