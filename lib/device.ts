import { browser } from 'wxt/browser';
import { loadDeviceId } from './storage';
import type { DeviceInfo } from './types';

interface BrowserPattern {
  pattern: RegExp;
  name: string;
}

const BROWSER_PATTERNS: BrowserPattern[] = [
  { pattern: /Edg(?:e|A|iOS)?\/([\d.]+)/i, name: 'edge' },
  { pattern: /OPR\/([\d.]+)/i, name: 'opera' },
  { pattern: /Firefox\/([\d.]+)/i, name: 'firefox' },
  { pattern: /Chrome\/([\d.]+)/i, name: 'chrome' },
  { pattern: /Version\/([\d.]+).*Safari/i, name: 'safari' },
];

/** Best-effort browser name + version from the user agent string. */
export function detectBrowser(userAgent: string): { name: string; version: string } {
  for (const { pattern, name } of BROWSER_PATTERNS) {
    const match = userAgent.match(pattern);
    if (match) return { name, version: match[1] ?? '' };
  }
  return { name: 'unknown', version: '' };
}

function detectPlatform(): string {
  const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData;
  return userAgentData?.platform ?? navigator.platform ?? '';
}

/**
 * Device metadata reported to the server on every bookmark upload.
 *
 * Deliberately narrow: no full User-Agent string and no other fingerprinting
 * data. `browser`, `version` and `platform` are what the device list needs to
 * tell two machines apart.
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  const id = await loadDeviceId();
  const userAgent = navigator.userAgent;

  const runtime = browser.runtime as typeof browser.runtime & {
    getBrowserInfo?: () => Promise<{ name: string; version: string }>;
  };
  let browserName = '';
  let version = '';
  try {
    const info = await runtime.getBrowserInfo?.();
    if (info) {
      browserName = info.name.toLowerCase();
      version = info.version;
    }
  } catch {
    /* getBrowserInfo is Firefox-only */
  }
  if (!browserName) {
    const detected = detectBrowser(userAgent);
    browserName = detected.name;
    version = detected.version;
  }

  return {
    id,
    browser: browserName,
    version,
    platform: detectPlatform(),
  };
}
