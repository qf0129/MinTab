import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { SETTINGS_KEY } from '../lib/constants';
import { loadSettings, saveSettings } from '../lib/storage';
import type { Settings } from '../lib/types';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadSettings().then((next) => {
      if (!active) return;
      setSettings(next);
      setLoading(false);
    });
    const listener = (
      changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
      area: string
    ) => {
      if (area !== 'local' || !changes[SETTINGS_KEY]) return;
      void loadSettings().then((next) => {
        if (active) setSettings(next);
      });
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { settings, loading, updateSettings };
}
