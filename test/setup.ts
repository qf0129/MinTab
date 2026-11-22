import { vi } from 'vitest';

/**
 * The UI strings live in `public/_locales` and are resolved by the browser.
 * Tests run outside a browser, so the translator is pointed at the English
 * bundle: assertions then read real sentences instead of raw message keys.
 */
vi.mock('wxt/browser', async () => {
  const en = (await import('../public/_locales/en/messages.json')).default as Record<
    string,
    { message: string }
  >;
  return {
    browser: {
      i18n: {
        getMessage: (key: string) => en[key]?.message ?? '',
        getUILanguage: () => 'en-US',
      },
    },
  };
});
