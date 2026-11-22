import { ExternalLink } from 'lucide-react';
import { PRODUCT_NAME } from '../../../lib/constants';
import { t } from '../../../lib/i18n';
import { cardClass, PanelSection } from './ui';

const REPO_URL = 'https://github.com/qf0129/MinTab';

const LINKS = [
  {
    id: 'repo',
    labelKey: 'about_repo',
    detailKey: 'about_repoDetail',
    href: REPO_URL,
  },
  {
    id: 'issues',
    labelKey: 'about_issues',
    detailKey: 'about_issuesDetail',
    href: `${REPO_URL}/issues`,
  },
  {
    id: 'privacy',
    labelKey: 'about_privacy',
    detailKey: 'about_privacyDetail',
    href: `${REPO_URL}/blob/main/PRIVACY.md`,
  },
  {
    id: 'license',
    labelKey: 'about_license',
    detailKey: 'about_licenseDetail',
    href: `${REPO_URL}/blob/main/LICENSE`,
  },
] as const;

/** Read-only product card: name, version, links and the local-data promise. */
export function AboutPanel() {
  const manifest = browser.runtime.getManifest();
  const version = manifest.version;

  return (
    <div className="space-y-6">
      <PanelSection title={t('about_info')}>
        <div className={`${cardClass} flex items-start gap-3.5 p-4`}>
          <img
            src={browser.runtime.getURL('/icon128.png')}
            alt=""
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-xl shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{PRODUCT_NAME}</p>
              <span className="rounded-full bg-[#26734d]/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-[#26734d]">
                v{version}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-black/55">{manifest.description}</p>
          </div>
        </div>
      </PanelSection>

      <PanelSection title={t('about_links')}>
        <ul className={`${cardClass} divide-y divide-black/6 overflow-hidden`}>
          {LINKS.map((link) => (
            <li key={link.id}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="focus-ring group flex items-center gap-3 px-3.5 py-2.5 transition hover:bg-black/[0.02]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{t(link.labelKey)}</span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-black/40">
                    {t(link.detailKey)}
                  </span>
                </span>
                <ExternalLink
                  size={14}
                  className="shrink-0 text-black/25 transition group-hover:text-[#176b61]"
                />
              </a>
            </li>
          ))}
        </ul>
      </PanelSection>

      <PanelSection title={t('about_privacySection')}>
        <div className={`${cardClass} space-y-1.5 px-3.5 py-3 text-xs leading-5 text-black/55`}>
          <p>{t('about_privacyBody1')}</p>
          <p>{t('about_privacyBody2')}</p>
        </div>
      </PanelSection>
    </div>
  );
}
