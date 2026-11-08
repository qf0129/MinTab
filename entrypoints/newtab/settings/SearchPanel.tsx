import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { SEARCH_ENGINES } from '../../../lib/constants';
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
      setError('请填写名称和包含 {query} 的 HTTP(S) 地址');
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
      <PanelSection title="搜索框">
        <div className={`${cardClass} flex items-center gap-3 px-3.5 py-3`}>
          <div className="min-w-0 flex-1">
            <p className="text-sm">显示搜索框</p>
            <p className="mt-0.5 text-[11px] text-black/45">关闭后顶部只保留设置入口。</p>
          </div>
          <Switch
            checked={settings.searchEnabled}
            onChange={(checked) => void onSettings({ searchEnabled: checked })}
            label="显示搜索框"
          />
        </div>
      </PanelSection>

      <PanelSection title="搜索引擎">
        <ul className={`${cardClass} divide-y divide-black/6 overflow-hidden`}>
          {rows.map(({ engine, custom }) => {
            const current = settings.searchEngine === engine.id;
            return (
              <li key={engine.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-black/[0.05] text-[11px] font-semibold text-black/55">
                  {engine.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{engine.name}</span>
                {current && (
                  <span className="shrink-0 rounded-full bg-[#26734d]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#26734d]">
                    当前
                  </span>
                )}
                {custom && (
                  <button
                    type="button"
                    title={`删除「${engine.name}」`}
                    aria-label={`删除「${engine.name}」`}
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

      <PanelSection title="添加搜索引擎">
        <div className={`${cardClass} space-y-2 p-3`}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={engineName}
              onChange={(event) => setEngineName(event.target.value)}
              placeholder="名称"
              aria-label="搜索引擎名称"
              className={`${fieldClass} sm:w-32`}
            />
            <input
              value={engineUrl}
              onChange={(event) => setEngineUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addEngine();
              }}
              placeholder="https://example.com/search?q={query}"
              aria-label="搜索地址（用 {query} 表示关键词）"
              className={`${fieldClass} flex-1 font-mono text-xs`}
            />
            <button type="button" className={primaryButton} onClick={addEngine}>
              <Plus size={15} />
              添加
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </PanelSection>
    </div>
  );
}
