import type { ReactNode } from 'react';

/**
 * Shared control styles for the settings dialog.
 *
 * Keeping the strings here means every panel uses the same radius, density and
 * mint accent instead of drifting apart panel by panel.
 */
export const primaryButton =
  'focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#26734d] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[#1f6140] disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButton =
  'focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-white px-3.5 py-2 text-sm text-black/70 transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50';

export const fieldClass =
  'w-full rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-[#1f2928] outline-none transition placeholder:text-black/30 focus:border-[#26734d] focus:ring-2 focus:ring-[#26734d]/15 disabled:opacity-60';

export const cardClass = 'rounded-xl border border-black/8 bg-white/70';

/** Compact text action for card footers and inline "go there" links. */
export const ghostButton =
  'focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-black/60 transition hover:bg-black/[0.05] hover:text-black/80 disabled:cursor-not-allowed disabled:opacity-50';

export const dangerGhostButton =
  'focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600/85 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50';

/** Muted accent link that reads as text but behaves like a button. */
export const inlineLink =
  'focus-ring rounded text-xs font-medium text-[#176b61] underline decoration-[#176b61]/30 underline-offset-2 transition hover:decoration-[#176b61]/70';

interface PanelSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** Titled block inside a settings panel. */
export function PanelSection({ title, description, children }: PanelSectionProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-0.5 text-xs leading-5 text-black/55">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** On/off control for settings that apply immediately, with a visible focus ring. */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-[#26734d]' : 'bg-black/20'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[1.375rem]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
