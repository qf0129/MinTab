import type { CardOpacity, SearchEngine, Settings } from './types';

/** Base URL of the web app, without a trailing slash. */
export const SITE_BASE = (import.meta.env.WXT_SITE_BASE || 'http://127.0.0.1:8787').replace(
  /\/+$/,
  ''
);
/**
 * Display name. Forks can rebrand without touching source: set
 * `WXT_PRODUCT_NAME` at build time and both the manifest and the UI follow.
 */
export const PRODUCT_NAME = import.meta.env.WXT_PRODUCT_NAME || 'MinTab';
export const SETTINGS_KEY = 'mintab_settings';
export const DEVICE_ID_KEY = 'mintab_device_id';
export const LAST_UPLOAD_KEY = 'mintab_last_upload';
/** Folder ids whose group is collapsed on the new tab page. */
export const COLLAPSED_GROUPS_KEY = 'mintab_collapsed_groups';
/**
 * Token issued by the web app during the connection handshake. Stored locally so
 * the extension never has to read the web session cookie (no `cookies` permission).
 */
export const EXTENSION_TOKEN_KEY = 'mintab_extension_token';
/** One-time handshake state waiting for the user to approve it in the web app. */
export const PENDING_LINK_KEY = 'mintab_pending_link';

/**
 * A built-in page background.
 *
 * Everything is expressed through longhands (`background-image`, `-color`,
 * `-size`, `-repeat`) so switching presets never has to rewrite the `background`
 * shorthand and wipe the other layers. `image: 'none'` means a solid colour.
 */
export interface BackgroundPreset {
  id: string;
  name: string;
  backgroundImage: string;
  backgroundColor: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
}

export const DEFAULT_BACKGROUND_PRESET: BackgroundPreset = {
  id: 'mist',
  name: '高级灰',
  backgroundImage:
    'radial-gradient(110% 80% at 14% 0%, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0) 58%), radial-gradient(90% 75% at 88% 100%, rgba(60, 68, 78, 0.3) 0%, rgba(60, 68, 78, 0) 62%), linear-gradient(150deg, #eceef0 0%, #d7dce0 34%, #b9c1c8 68%, #9aa4ad 100%)',
  backgroundColor: '#d7dce0',
};

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  DEFAULT_BACKGROUND_PRESET,
  {
    id: 'ivory',
    name: '象牙',
    backgroundImage: 'none',
    backgroundColor: '#f4efe4',
  },
  {
    id: 'graphite',
    name: '石墨',
    backgroundImage: 'none',
    backgroundColor: '#26302d',
  },
  {
    id: 'dusk',
    name: '暮色',
    backgroundImage: 'linear-gradient(150deg, #fbe8d3 0%, #f3c9c0 42%, #b9a3c9 100%)',
    backgroundColor: '#f3c9c0',
  },
  {
    id: 'ocean',
    name: '海盐',
    backgroundImage: 'linear-gradient(150deg, #e6f4f6 0%, #cfe4f2 48%, #c3d2ec 100%)',
    backgroundColor: '#cfe4f2',
  },
  {
    id: 'mint',
    name: '薄荷',
    backgroundImage:
      'radial-gradient(circle at 20% 10%, rgba(143, 216, 184, 0.55), transparent 55%), radial-gradient(circle at 85% 80%, rgba(94, 160, 205, 0.35), transparent 60%), linear-gradient(160deg, #f7fdfa 0%, #e8f4ef 100%)',
    backgroundColor: '#e8f4ef',
  },
  {
    id: 'grid',
    name: '网格',
    backgroundImage:
      'repeating-linear-gradient(0deg, rgba(23, 107, 97, 0.10) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, rgba(23, 107, 97, 0.10) 0 1px, transparent 1px 32px)',
    backgroundColor: '#f2f8f6',
  },
  {
    id: 'dots',
    name: '圆点',
    backgroundImage: 'radial-gradient(rgba(23, 107, 97, 0.18) 1.5px, transparent 1.6px)',
    backgroundColor: '#f7fbf9',
    backgroundSize: '22px 22px',
    backgroundRepeat: 'repeat',
  },
  {
    id: 'stripes',
    name: '斜纹',
    backgroundImage:
      'repeating-linear-gradient(135deg, rgba(23, 107, 97, 0.08) 0 14px, rgba(23, 107, 97, 0) 14px 28px)',
    backgroundColor: '#f4faf7',
  },
  {
    id: 'aurora',
    name: '极光',
    backgroundImage:
      'conic-gradient(from 210deg at 72% 18%, #d9f0e8, #eef6f9, #f7e7d8, #dfe9fa, #d9f0e8)',
    backgroundColor: '#eef6f9',
  },
];

export const DEFAULT_SETTINGS: Settings = {
  backgroundImage: null,
  backgroundPreset: DEFAULT_BACKGROUND_PRESET.id,
  newTabBookmarkSize: 'medium',
  cardOpacity: 'medium',
  searchEnabled: true,
  searchEngine: 'google',
  customSearchEngines: [],
};

/**
 * The single new tab palette.
 *
 * Text always sits on one of the light surfaces below, never directly on the
 * page background, so the page stays readable over any user background image.
 * That is why there is one palette instead of a light/dark pair: even the
 * clearest surface keeps enough white to carry dark text over bright and dark
 * photos, and a light scrim softens the image behind them.
 */
export interface Theme {
  /** "Glass" gradient for cards, the search bar and the settings button. */
  chip: string;
  /**
   * Mint-tinted glass for folder panels and root group headers, kept apart from
   * `chip` so a panel and the bookmark buttons inside it never share a surface.
   * Deliberately translucent: the background should still show through, while
   * `fg` text stays readable thanks to the page scrim and the panel border.
   */
  folder: string;
  /** Foreground colour, always used on top of `chip` or `folder`. */
  fg: string;
  /** Accent gradient for buttons, dots and highlights. */
  accent: string;
  /** Solid accent colour for icons and text, where a gradient cannot apply. */
  accentSolid: string;
  /** Soft accent tint, used for focus rings and decorative glows. */
  accentSoft: string;
  /** Hairline border colour. */
  line: string;
}

/**
 * Alpha pair (`from`, `to`) for the two glass gradients at each opacity level.
 *
 * One fixed value cannot work for every background: a pale preset wants the
 * wallpaper to show through, a dark photo needs a denser surface to keep dark
 * text readable. The `medium` level is the default and is already lighter than
 * the original near-solid cards.
 */
const CARD_ALPHA: Record<CardOpacity, { chip: [number, number]; folder: [number, number] }> = {
  clear: { chip: [0.4, 0.3], folder: [0.3, 0.1] },
  medium: { chip: [0.84, 0.7], folder: [0.7, 0.55] },
  solid: { chip: [0.96, 0.84], folder: [0.86, 0.68] },
};

const THEME_BASE: Omit<Theme, 'chip' | 'folder'> = {
  fg: '#1f2928',
  accent: 'linear-gradient(135deg, #1ea08b 0%, #176b61 100%)',
  accentSolid: '#176b61',
  accentSoft: 'rgba(23, 107, 97, 0.16)',
  line: 'rgba(23, 107, 97, 0.14)',
};

/** Palette for the chosen card/folder transparency level. */
export function themeFor(opacity: CardOpacity): Theme {
  const level = CARD_ALPHA[opacity] ?? CARD_ALPHA.medium;
  return {
    ...THEME_BASE,
    chip: `linear-gradient(135deg, rgba(255, 255, 255, ${level.chip[0]}) 0%, rgba(255, 255, 255, ${level.chip[1]}) 100%)`,
    folder: `linear-gradient(135deg, rgba(237, 248, 244, ${level.folder[0]}) 0%, rgba(224, 239, 234, ${level.folder[1]}) 100%)`,
  };
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={query}' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={query}' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd={query}' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' },
];
