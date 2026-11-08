import { browser } from 'wxt/browser';

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T & { error?: string };
}

/**
 * The only place that performs network I/O.
 *
 * Every call is proxied through the background service worker so the
 * extension token stays in one place, and so the new tab page never has to
 * embed an `Authorization` header (or a backend URL) itself.
 */
export async function request<T = unknown>(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<ApiResponse<T>> {
  return browser.runtime.sendMessage({ type: 'api', path, method, body }) as Promise<
    ApiResponse<T>
  >;
}
