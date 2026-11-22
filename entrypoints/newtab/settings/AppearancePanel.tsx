import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  BACKGROUND_PRESETS,
  type BackgroundPreset,
  DEFAULT_BACKGROUND_PRESET,
} from '../../../lib/constants';
import { type MessageKey, t } from '../../../lib/i18n';
import type { Settings } from '../../../lib/types';
import { PanelSection } from './ui';

interface Props {
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => unknown | Promise<unknown>;
}

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
/** Long edge of the stored background; larger images are downscaled. */
const MAX_BACKGROUND_EDGE = 1920;
/** `storage.local` is a shared 10 MB budget, so keep the data URL well below it. */
const TARGET_DATA_URL_CHARS = 900 * 1024;

const BOOKMARK_SIZES = [
  { id: 'small', labelKey: 'appearance_size_small' },
  { id: 'medium', labelKey: 'appearance_size_medium' },
  { id: 'large', labelKey: 'appearance_size_large' },
] as const satisfies readonly { id: string; labelKey: MessageKey }[];

const CARD_OPACITIES = [
  {
    id: 'clear',
    labelKey: 'appearance_opacity_clear',
    hintKey: 'appearance_opacity_clearHint',
  },
  {
    id: 'medium',
    labelKey: 'appearance_opacity_medium',
    hintKey: 'appearance_opacity_mediumHint',
  },
  {
    id: 'solid',
    labelKey: 'appearance_opacity_solid',
    hintKey: 'appearance_opacity_solidHint',
  },
] as const satisfies readonly { id: string; labelKey: MessageKey; hintKey: MessageKey }[];

/**
 * Downscale and re-encode the picked image before storing it.
 *
 * The background used to be stored as the raw file's base64 data URL: a 5 MB
 * photo became ~6.7 MB inside `storage.local` and was decoded again on every
 * new tab. Re-encoding to a bounded WebP keeps the stored value near the
 * intended size.
 */
async function compressBackground(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_BACKGROUND_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    context.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.86;
    let dataUrl = canvas.toDataURL('image/webp', quality);
    while (dataUrl.length > TARGET_DATA_URL_CHARS && quality > 0.4) {
      quality -= 0.12;
      dataUrl = canvas.toDataURL('image/webp', quality);
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}

/** Background presets, an optional photo, and bookmark card size. */
export function AppearancePanel({ settings, onSettings }: Props) {
  const [backgroundError, setBackgroundError] = useState('');
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  const setBackgroundImage = async (file: File | undefined) => {
    if (!file) return;
    setBackgroundError('');
    if (!file.type.startsWith('image/')) {
      setBackgroundError(t('appearance_notImage'));
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setBackgroundError(t('appearance_tooLarge'));
      return;
    }
    try {
      await onSettings({ backgroundImage: await compressBackground(file) });
    } catch {
      setBackgroundError(t('appearance_processFailed'));
    } finally {
      if (backgroundInputRef.current) backgroundInputRef.current.value = '';
    }
  };

  const background = settings.backgroundImage;
  const activePreset =
    BACKGROUND_PRESETS.find((preset) => preset.id === settings.backgroundPreset) ??
    DEFAULT_BACKGROUND_PRESET;

  return (
    <div className="space-y-6">
      <PanelSection title={t('appearance_background')}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {BACKGROUND_PRESETS.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              selected={!background && activePreset.id === preset.id}
              onClick={() =>
                void onSettings({ backgroundPreset: preset.id, backgroundImage: null })
              }
            />
          ))}
          <button
            type="button"
            onClick={() => backgroundInputRef.current?.click()}
            aria-pressed={Boolean(background)}
            aria-label={background ? t('appearance_changeCustom') : t('appearance_useCustom')}
            className={`focus-ring overflow-hidden rounded-lg border text-left transition ${
              background
                ? 'border-[#176b61] ring-2 ring-[#176b61]/20'
                : 'border-dashed border-black/15 hover:border-black/25'
            }`}
          >
            <span
              className="flex h-16 w-full items-center justify-center bg-white/45"
              style={
                background
                  ? {
                      backgroundImage: `url(${background})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
              aria-hidden
            >
              {!background && <ImagePlus size={18} className="text-black/35" />}
            </span>
            <span className="flex items-center justify-between gap-1 border-t border-black/6 bg-white/85 px-2 py-1">
              <span className="truncate text-[11px] font-medium">{t('appearance_custom')}</span>
              {background && <Check size={12} className="shrink-0 text-[#176b61]" />}
            </span>
          </button>
        </div>

        <input
          ref={backgroundInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => void setBackgroundImage(event.target.files?.[0])}
        />

        {background && (
          <button
            type="button"
            onClick={() => {
              setBackgroundError('');
              void onSettings({ backgroundImage: null });
            }}
            className="focus-ring mt-2 inline-flex items-center gap-1 rounded px-1 text-xs text-black/45 transition hover:text-red-600"
          >
            <Trash2 size={12} />
            {t('appearance_removeCustom')}
          </button>
        )}
        {backgroundError && <p className="mt-2 text-xs text-red-600">{backgroundError}</p>}
      </PanelSection>

      <PanelSection title={t('appearance_cards')}>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-black/50">{t('appearance_size')}</span>
            <div className="inline-flex rounded-lg border border-black/8 bg-black/[0.03] p-1">
              {BOOKMARK_SIZES.map((size) => {
                const selected = settings.newTabBookmarkSize === size.id;
                return (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => void onSettings({ newTabBookmarkSize: size.id })}
                    aria-pressed={selected}
                    className={`focus-ring rounded-md px-4 py-1.5 text-sm transition ${
                      selected
                        ? 'bg-white font-medium text-[#176b61] shadow-sm'
                        : 'text-black/55 hover:text-black/75'
                    }`}
                  >
                    {t(size.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-black/50">{t('appearance_opacity')}</span>
            <div className="inline-flex rounded-lg border border-black/8 bg-black/[0.03] p-1">
              {CARD_OPACITIES.map((option) => {
                const selected = settings.cardOpacity === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => void onSettings({ cardOpacity: option.id })}
                    aria-pressed={selected}
                    title={t(option.hintKey)}
                    className={`focus-ring rounded-md px-4 py-1.5 text-sm transition ${
                      selected
                        ? 'bg-white font-medium text-[#176b61] shadow-sm'
                        : 'text-black/55 hover:text-black/75'
                    }`}
                  >
                    {t(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PanelSection>
    </div>
  );
}

interface PresetCardProps {
  preset: BackgroundPreset;
  selected: boolean;
  onClick: () => void;
}

/** Thumbnail plus name; the preview uses the same longhands as the page. */
function PresetCard({ preset, selected, onClick }: PresetCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={t('appearance_usePreset', { name: t(preset.labelKey) })}
      className={`focus-ring overflow-hidden rounded-lg border text-left transition ${
        selected
          ? 'border-[#176b61] ring-2 ring-[#176b61]/20'
          : 'border-black/10 hover:border-black/25'
      }`}
    >
      <span
        className="block h-16 w-full"
        style={{
          backgroundImage: preset.backgroundImage,
          backgroundColor: preset.backgroundColor,
          backgroundSize: preset.backgroundSize,
          backgroundRepeat: preset.backgroundRepeat,
        }}
        aria-hidden
      />
      <span className="flex items-center justify-between gap-1 border-t border-black/6 bg-white/85 px-2 py-1">
        <span className="truncate text-[11px] font-medium">{t(preset.labelKey)}</span>
        {selected && <Check size={12} className="shrink-0 text-[#176b61]" />}
      </span>
    </button>
  );
}
