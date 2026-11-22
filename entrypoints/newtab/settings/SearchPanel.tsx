import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { SEARCH_ENGINES, searchEngineLabel } from '../../../lib/constants';
import { t } from '../../../lib/i18n';
import type { SearchEngine, Settings } from '../../../lib/types';
import { compactUuid } from '../../../lib/utils';
import { cardClass, fieldClass, PanelSection, primaryButton, Switch } from './ui';

interface Props {
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => unknown | Promise<unknown>;
}

/** Search box visibility plus the engine list (built-ins are fixed). */
export function SearchPanel({ settings, onSettings }: Props) {
  const [engineName, setEngineName] = useState('');
  const [engineUrl, setEngineUrl] = useState('');
  const [error, setError] = useState('');

  const rows: { engine: SearchEngine; custom: boolean }[] = [
    ...SEARCH_ENGINES.map((engine) => ({ engine, custom: false })),
    ...settings.customSearchEngines.map((engine) => ({ engine, custom: true })),
  ];

  const addEngine = () => {
    const name = engineName.trim();
    const template = engineUrl.trim().replace(/%s/g, '{query}');
    try {
      const parsed = new URL(template.replaceAll('{query}', 'test'));
      if (!name || !template.includes('{query}') || !['http:', 'https:'].includes(parsed.protocol))
        throw new Error();
    } catch {
      setError(t('search_invalid'));
      return;
    }
    const next: SearchEngine[] = [
      ...settings.customSearchEngines,
      { id: compactUuid(), name, url: template },
    ];
    void onSettings({ customSearchEngines: next });
    setEngineName('');
    setEngineUrl('');
    setError('');
  };

  return (
    <div className="space-y-6">
      <PanelSection title={t('search_section_box')}>
        <div className={`${cardClass} flex items-center gap-3 px-3.5 py-3`}>
          <div className="min-w-0 flex-1">
            <p className="text-sm">{t('search_show')}</p>
            <p className="mt-0.5 text-[11px] text-black/45">{t('search_showHint')}</p>
          </div>
          <Switch
            checked={settings.searchEnabled}
            onChange={(checked) => void onSettings({ searchEnabled: checked })}
            label={t('search_show')}
          />
        </div>
      </PanelSection>

      <PanelSection title={t('search_section_engines')}>
        <ul className={`${cardClass} divide-y divide-black/6 overflow-hidden`}>
          {rows.map(({ engine, custom }) => {
            const current = settings.searchEngine === engine.id;
            const label = searchEngineLabel(engine);
            return (
              <li key={engine.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-black/[0.05] text-[11px] font-semibold text-black/55">
                  {label.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                {current && (
                  <span className="shrink-0 rounded-full bg-[#26734d]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#26734d]">
                    {t('search_current')}
                  </span>
                )}
                {custom && (
                  <button
                    type="button"
                    title={t('search_remove', { name: label })}
                    aria-label={t('search_remove', { name: label })}
                    onClick={() =>
                      void onSettings({
                        customSearchEngines: settings.customSearchEngines.filter(
                          (item) => item.id !== engine.id
                        ),
                        searchEngine:
                          settings.searchEngine === engine.id
                            ? (SEARCH_ENGINES[0]?.id ?? 'google')
                            : settings.searchEngine,
                      })
                    }
                    className="focus-ring shrink-0 rounded-md p-1.5 text-black/35 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </PanelSection>

      <PanelSection title={t('search_section_add')}>
        <div className={`${cardClass} space-y-2 p-3`}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={engineName}
              onChange={(event) => setEngineName(event.target.value)}
              placeholder={t('search_name')}
              aria-label={t('search_nameLabel')}
              className={`${fieldClass} sm:w-32`}
            />
            <input
              value={engineUrl}
              onChange={(event) => setEngineUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addEngine();
              }}
              placeholder="https://example.com/search?q={query}"
              aria-label={t('search_urlLabel')}
              className={`${fieldClass} flex-1 font-mono text-xs`}
            />
            <button type="button" className={primaryButton} onClick={addEngine}>
              <Plus size={15} />
              {t('search_add')}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </PanelSection>
    </div>
  );
}
