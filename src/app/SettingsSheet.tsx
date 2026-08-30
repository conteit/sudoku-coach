/**
 * Settings: language, theme, and the two switches that change how the board
 * behaves.
 *
 * Everything here writes straight to the profile store, which persists it.
 * There is no save button because there is nothing to save — a toggle is the
 * decision, not a draft of one.
 */

import type { Locale, PlayerProfile } from '../state/types';
import { LOCALES } from '../i18n';
import { useT } from '../i18n/locale';
import { Sheet } from '../ui/primitives/Sheet';
import { Toggle } from '../ui/primitives/Toggle';
import { cx } from '../ui/primitives/cx';

type ThemeChoice = PlayerProfile['settings']['theme'];

const THEMES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

const THEME_KEYS = {
  system: 'settings.theme.system',
  light: 'settings.theme.light',
  dark: 'settings.theme.dark',
} as const;

const LOCALE_LABELS: Record<Locale, string> = { en: 'English', it: 'Italiano' };

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  profile: PlayerProfile;
  onLocale: (locale: Locale) => void;
  onSettings: (patch: Partial<PlayerProfile['settings']>) => void;
}

function Choices<T extends string>({
  label,
  value,
  options,
  render,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  render: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div role="group" aria-label={label} className="flex gap-1 rounded-cell bg-paper-sunk p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cx(
              'rounded-cell px-3 py-1.5 text-sm transition-colors duration-100 ease-snap',
              value === option ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-raised',
            )}
          >
            {render(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsSheet({
  open,
  onClose,
  profile,
  onLocale,
  onSettings,
}: SettingsSheetProps) {
  const t = useT();

  return (
    <Sheet open={open} onClose={onClose} title={t('settings.title')}>
      <div className="flex flex-col gap-4 pb-2">
        <Choices
          label={t('settings.language')}
          value={profile.locale}
          options={LOCALES}
          render={(locale) => LOCALE_LABELS[locale]}
          onChange={onLocale}
        />
        <Choices
          label={t('settings.theme')}
          value={profile.settings.theme}
          options={THEMES}
          render={(theme) => t(THEME_KEYS[theme])}
          onChange={(theme) => onSettings({ theme })}
        />
        <Toggle
          label={t('settings.highlightConflicts')}
          checked={profile.settings.highlightConflicts}
          onChange={(highlightConflicts) => onSettings({ highlightConflicts })}
        />
        <Toggle
          label={t('settings.haptics')}
          checked={profile.settings.haptics}
          onChange={(haptics) => onSettings({ haptics })}
        />
      </div>
    </Sheet>
  );
}
