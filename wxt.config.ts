import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

const DEFAULT_SITE_BASE = 'http://127.0.0.1:8787';

/**
 * Manifest strings are localized through `_locales` (`default_locale: en`), so an
 * unsupported browser language falls back to English instead of Chinese. Setting
 * `WXT_PRODUCT_NAME` / `WXT_PRODUCT_DESCRIPTION` still wins for forks that want
 * one hardcoded name.
 */
const MESSAGES_PRODUCT_NAME = '__MSG_extName__';
const MESSAGES_DESCRIPTION = '__MSG_extDescription__';

/**
 * Read a `WXT_*` variable from the same files Vite loads, with the same
 * precedence (later wins):
 *
 *   进程环境变量 > .env.[mode].local > .env.[mode] > .env.local > .env
 *
 * `wxt dev` uses mode=development, `wxt build` uses mode=production. This is
 * duplicated from Vite because `host_permissions` is computed while the config
 * is evaluated, before Vite has loaded `.env` files.
 */
function readEnvValue(mode: string, key: string): string | undefined {
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`];
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`);
  let value: string | undefined;
  for (const file of files) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = pattern.exec(line);
      const raw = match?.[1];
      if (raw) value = raw.replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return value;
}

function resolveSiteBase(mode: string): string {
  return (
    process.env.WXT_SITE_BASE ??
    readEnvValue(mode, 'WXT_SITE_BASE') ??
    DEFAULT_SITE_BASE
  ).replace(/\/+$/, '');
}

/**
 * Explicit name/description overrides; `undefined` means "let `_locales` decide".
 */
function resolveManifestText(mode: string): { name?: string; description?: string } {
  const name = (process.env.WXT_PRODUCT_NAME ?? readEnvValue(mode, 'WXT_PRODUCT_NAME'))?.trim();
  const description = (
    process.env.WXT_PRODUCT_DESCRIPTION ?? readEnvValue(mode, 'WXT_PRODUCT_DESCRIPTION')
  )?.trim();
  return { name: name || undefined, description: description || undefined };
}

function isLoopback(url: string): boolean {
  try {
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** `wxt prepare` also evaluates the manifest; only warn for real release commands. */
function isReleaseCommand(): boolean {
  return process.argv.includes('build') || process.argv.includes('zip');
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  webExt: { disabled: true },
  manifest: ({ mode }) => {
    const siteBase = resolveSiteBase(mode);

    // A release build silently pointing at localhost is the classic fork
    // mistake: everything compiles, and every request fails at runtime.
    if (mode === 'production' && isReleaseCommand() && isLoopback(siteBase)) {
      const message =
        `[mintab] production build still targets ${siteBase}. ` +
        'Set WXT_SITE_BASE to your backend before releasing ' +
        '(see docs/release.md), or set WXT_STRICT_SITE=1 to make this fatal.';
      if (process.env.WXT_STRICT_SITE === '1') throw new Error(message);
      console.warn(message);
    }

    const manifestText = resolveManifestText(mode);
    const name = manifestText.name ?? MESSAGES_PRODUCT_NAME;

    return {
      name,
      description: manifestText.description ?? MESSAGES_DESCRIPTION,
      // `_locales/<browser UI language>` is picked by the browser; anything we
      // do not ship falls back to this locale, which is why the default is
      // English rather than the project's own language.
      default_locale: 'en',
      // Version comes from package.json so there is one source of truth.
      // `cookies` is deliberately absent: the extension authenticates with the
      // token issued by the web handshake, so it never reads the session cookie.
      // The side panel permission is added automatically by WXT from the
      // `sidepanel` entrypoint (`side_panel.default_path`).
      permissions: ['storage', 'favicon', 'bookmarks'],
      host_permissions: [`${new URL(siteBase).origin}/*`],
      action: { default_title: name },
      chrome_url_overrides: { newtab: 'newtab.html' },
      icons: {
        16: 'icon16.png',
        32: 'icon32.png',
        48: 'icon48.png',
        128: 'icon128.png',
      },
      web_accessible_resources: [
        {
          resources: ['_favicon/*'],
          matches: ['http://*/*', 'https://*/*'],
          use_dynamic_url: true,
        },
      ],
    };
  },
});
