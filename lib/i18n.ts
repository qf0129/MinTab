import { browser } from 'wxt/browser';
import type enMessages from '../public/_locales/en/messages.json';

/** Every key defined in `public/_locales/en/messages.json` (the source of truth). */
export type MessageKey = keyof typeof enMessages;

type Params = Record<string, string | number>;

interface MinimalI18n {
  getMessage?: (key: string) => string;
  getUILanguage?: () => string;
}

/**
 * `browser.i18n` is absent outside an extension (unit tests, plain web build of
 * these modules), so every access goes through this guard instead of assuming
 * the namespace exists.
 */
function i18n(): MinimalI18n | undefined {
  return (browser as unknown as { i18n?: MinimalI18n } | undefined)?.i18n;
}

function lookup(key: string): string {
  try {
    return i18n()?.getMessage?.(key) ?? '';
  } catch {
    return '';
  }
}

/**
 * Translate `key` into the browser's UI language.
 *
 * The browser resolves the locale itself: it picks `_locales/<locale>` when that
 * locale exists and otherwise falls back to `default_locale` (English), which is
 * what makes "unsupported language ⇒ English" work without any detection code
 * here. A key missing from the current locale also falls back to English.
 */
export function t(key: MessageKey, params?: Params): string {
  const template = lookup(key) || key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );
}

/** BCP-47 tag of the browser UI language, e.g. `zh-CN`, `en-US`. */
export function uiLocale(): string {
  try {
    const tag = i18n()?.getUILanguage?.();
    if (tag) return tag;
  } catch {
    // Fall through to the page locale.
  }
  return typeof navigator === 'undefined' ? 'en' : navigator.language || 'en';
}

/** `Intl` formatting always follows the browser UI language, never a hardcoded tag. */
export function formatDateTime(timestamp: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(timestamp).toLocaleString(uiLocale(), options);
}

/**
 * Mirror the UI language onto `<html lang>`: it drives font selection, CJK/Latin
 * line-breaking and what screen readers announce, none of which follow
 * `getMessage` automatically.
 */
export function applyDocumentLanguage(): void {
  document.documentElement.lang = uiLocale();
}
