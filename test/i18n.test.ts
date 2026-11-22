import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { t } from '../lib/i18n';
import { formatRelativeTime } from '../lib/utils';

type Messages = Record<string, { message: string }>;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOCALES_DIR = join(ROOT, 'public', '_locales');
/** The default locale: every other locale must mirror its keys. */
const SOURCE_LOCALE = 'en';

function readMessages(locale: string): Messages {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'messages.json'), 'utf8')) as Messages;
}

function locales(): string[] {
  return readdirSync(LOCALES_DIR).filter((entry) =>
    statSync(join(LOCALES_DIR, entry)).isDirectory()
  );
}

/** Source files whose `t('…')` calls must resolve to a real message. */
function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) files.push(path);
    }
  };
  for (const dir of ['components', 'entrypoints', 'hooks', 'lib']) walk(join(ROOT, dir));
  return files;
}

/** `{name}`-style placeholders, sorted so the comparison ignores their order. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

describe('locales', () => {
  const source = readMessages(SOURCE_LOCALE);

  it('ships English plus the two Chinese locales', () => {
    expect(locales().sort()).toEqual(['en', 'zh_CN', 'zh_TW']);
  });

  it.each(locales().filter((locale) => locale !== SOURCE_LOCALE))(
    '%s defines exactly the same keys as en',
    (locale) => {
      const messages = readMessages(locale);
      expect(Object.keys(messages).sort()).toEqual(Object.keys(source).sort());
    }
  );

  it('every key is legal for the browser (_locales only allows [A-Za-z0-9_])', () => {
    const invalid = locales().flatMap((locale) =>
      Object.keys(readMessages(locale))
        .filter((key) => !/^[a-zA-Z0-9_]+$/.test(key))
        .map((key) => `${locale}:${key}`)
    );
    // A dot here makes Chrome refuse to load the whole extension.
    expect(invalid).toEqual([]);
  });

  it.each(locales())('%s keeps manifest strings within the store limits', (locale) => {
    const messages = readMessages(locale);
    // Chrome rejects the package outright when these overflow, so catch it here
    // instead of at upload time: name ≤ 45, description ≤ 132 characters.
    expect(messages.extName?.message.length ?? 0).toBeLessThanOrEqual(45);
    expect(messages.extDescription?.message.length ?? 0).toBeLessThanOrEqual(132);
  });

  it.each(locales())('%s has no empty message', (locale) => {
    const empty = Object.entries(readMessages(locale))
      .filter(([, value]) => !value.message.trim())
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it.each(locales().filter((locale) => locale !== SOURCE_LOCALE))(
    '%s keeps every placeholder used by en',
    (locale) => {
      const messages = readMessages(locale);
      const mismatched = Object.keys(source).filter((key) => {
        const expected = placeholders(source[key]?.message ?? '');
        const actual = placeholders(messages[key]?.message ?? '');
        return expected.join(',') !== actual.join(',');
      });
      // A dropped `{count}` silently prints the literal placeholder to users.
      expect(mismatched).toEqual([]);
    }
  );

  it('every key passed to t() exists in en', () => {
    const used = new Set<string>();
    for (const file of sourceFiles()) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
        if (match[1]) used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(100);
    expect([...used].filter((key) => !(key in source))).toEqual([]);
  });
});

describe('t()', () => {
  it('substitutes every named placeholder', () => {
    expect(t('app_uploaded', { count: 12 })).toBe('Uploaded 12 bookmarks');
  });

  it('leaves unknown placeholders alone instead of printing "undefined"', () => {
    expect(t('app_uploaded')).toContain('{count}');
  });

  it('returns the key when no message exists, so a typo is visible', () => {
    expect(t('nope.notAKey' as never)).toBe('nope.notAKey');
  });

  it('formats relative times through the same dictionary', () => {
    const now = Date.UTC(2026, 0, 2, 12, 0, 0);
    expect(formatRelativeTime(now - 30_000, now)).toBe('Just now');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe('3 h ago');
  });
});
