import { browser } from 'wxt/browser';

export function faviconUrl(pageUrl: string): string {
  const url = new URL('/_favicon/', browser.runtime.getURL('/newtab.html'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '32');
  return url.toString();
}

export function hostnameOf(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, '');
  } catch {
    return pageUrl;
  }
}
