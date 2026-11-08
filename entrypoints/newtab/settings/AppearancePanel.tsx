import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  BACKGROUND_PRESETS,
  type BackgroundPreset,
  DEFAULT_BACKGROUND_PRESET,
} from '../../../lib/constants';
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
  { id: 'small', label: '小' },
  { id: 'medium', label: '中' },
  { id: 'large', label: '大' },
] as const;

const CARD_OPACITIES = [
  { id: 'clear', label: '通透' },
  { id: 'medium', label: '适中' },
  { id: 'solid', label: '厚重' },
] as const;

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
      setBackgroundError('请选择图片文件');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setBackgroundError('图片不能超过 5 MB');
      return;
    }
    try {
      await onSettings({ backgroundImage: await compressBackground(file) });
    } catch {
      setBackgroundError('图片处理失败，请换一张格式为 JPG/PNG 的图片');
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
      <PanelSection title="背景">
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
            aria-label={background ? '更换自定义背景图片' : '使用自己的背景图片'}
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
              <span className="truncate text-[11px] font-medium">自定义</span>
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
            移除自定义背景
          </button>
        )}
        {backgroundError && <p className="mt-2 text-xs text-red-600">{backgroundError}</p>}
      </PanelSection>

      <PanelSection title="书签卡片">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-black/50">尺寸</span>
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
                    {size.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-black/50">透明度</span>
            <div className="inline-flex rounded-lg border border-black/8 bg-black/[0.03] p-1">
              {CARD_OPACITIES.map((option) => {
                const selected = settings.cardOpacity === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => void onSettings({ cardOpacity: option.id })}
                    aria-pressed={selected}
                    title={
                      option.id === 'clear'
                        ? '背景透出最多，适合浅色背景'
                        : option.id === 'solid'
                          ? '卡片更实，适合深色或花哨背景'
                          : '默认，兼顾透出与可读性'
                    }
                    className={`focus-ring rounded-md px-4 py-1.5 text-sm transition ${
                      selected
                        ? 'bg-white font-medium text-[#176b61] shadow-sm'
                        : 'text-black/55 hover:text-black/75'
                    }`}
                  >
                    {option.label}
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
      aria-label={`使用「${preset.name}」背景`}
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
        <span className="truncate text-[11px] font-medium">{preset.name}</span>
        {selected && <Check size={12} className="shrink-0 text-[#176b61]" />}
      </span>
    </button>
  );
}
