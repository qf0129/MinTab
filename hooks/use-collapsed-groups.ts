import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { COLLAPSED_GROUPS_KEY } from '../lib/constants';
import { loadCollapsedGroups, saveCollapsedGroups } from '../lib/storage';

/**
 * Which bookmark groups are collapsed on the new tab page.
 *
 * The set lives in `browser.storage.local`, so opening a new tab restores the
 * exact expand/collapse state from last time, and every open new tab updates
 * live when another one toggles a group.
 */
export function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    void loadCollapsedGroups().then((ids) => {
      if (active) setCollapsed(new Set(ids));
    });
    const listener = (
      changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
      area: string
    ) => {
      if (area !== 'local' || !changes[COLLAPSED_GROUPS_KEY]) return;
      const next = changes[COLLAPSED_GROUPS_KEY]?.newValue;
      if (!Array.isArray(next)) return;
      setCollapsed(new Set(next.filter((id): id is string => typeof id === 'string')));
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  /** Toggle one group and persist the new set. */
  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      void saveCollapsedGroups([...next]);
      return next;
    });
  }, []);

  /** Expand the given groups (used before scrolling to a folder card). */
  const expand = useCallback((ids: string[]) => {
    setCollapsed((current) => {
      if (!ids.some((id) => current.has(id))) return current;
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      void saveCollapsedGroups([...next]);
      return next;
    });
  }, []);

  return { collapsed, toggle, expand };
}
