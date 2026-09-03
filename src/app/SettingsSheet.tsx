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
import { authAvailable, useAccount } from '../state/account';
import { Button } from '../ui/primitives/Button';
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

function AccountSection() {
  const t = useT();
  const account = useAccount((state) => state.account);
  const busy = useAccount((state) => state.busy);
  const failed = useAccount((state) => state.failed);
  const signIn = useAccount((state) => state.signIn);
  const signOut = useAccount((state) => state.signOut);

  if (!authAvailable()) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
        {t('account.title')}
      </h3>
      {account === null ? (
        <>
          <Button variant="secondary" size="lg" block disabled={busy} onClick={() => void signIn()}>
            {busy ? t('account.busy') : t('account.signIn')}
          </Button>
          <p className="text-sm leading-relaxed text-ink-soft">{t('account.why')}</p>
          {/* A failure is a state here, never a dialog: the commonest one is
              a closed popup, which the player did on purpose. */}
          {failed ? <p className="text-sm text-danger">{t('account.failed')}</p> : null}
        </>
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            {t('account.signedInAs', { who: account.email ?? account.displayName ?? account.uid })}
          </p>
          <Button variant="secondary" size="lg" block onClick={() => void signOut()}>
            {t('account.signOut')}
          </Button>
        </>
      )}
    </section>
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
        {/* The only place in the app that mentions an account at all, apart
            from one invitation on the library's empty desk. Paolo was
            explicit: no avatar, no session chrome, and nothing about this in
            the game view. A build with no Firebase config has no sign-in —
            not a disabled button, which would advertise a feature this build
            does not have. */}
        <AccountSection />
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
        {/* The colour the board draws, one switch per layer. They ship on —
            this is the board as it has always looked — and exist so a player
            who finds it noisy can quiet it a layer at a time rather than
            choosing between all of it and none. The coach's own spotlight is
            deliberately not here: it is not decoration, it is the hint
            pointing. */}
        <Toggle
          label={t('settings.highlightConflicts')}
          checked={profile.settings.highlightConflicts}
          onChange={(highlightConflicts) => onSettings({ highlightConflicts })}
        />
        <Toggle
          label={t('settings.highlightMatches')}
          checked={profile.settings.highlightMatches}
          onChange={(highlightMatches) => onSettings({ highlightMatches })}
        />
        <Toggle
          label={t('settings.highlightMatchingNotes')}
          checked={profile.settings.highlightMatchingNotes}
          onChange={(highlightMatchingNotes) => onSettings({ highlightMatchingNotes })}
        />
        <Toggle
          label={t('settings.highlightPeers')}
          checked={profile.settings.highlightPeers}
          onChange={(highlightPeers) => onSettings({ highlightPeers })}
        />
        <Toggle
          label={t('settings.colorEntries')}
          checked={profile.settings.colorEntries}
          onChange={(colorEntries) => onSettings({ colorEntries })}
        />
        <Toggle
          label={t('settings.markDeadNotes')}
          checked={profile.settings.markDeadNotes}
          onChange={(markDeadNotes) => onSettings({ markDeadNotes })}
        />
        {/* The one switch here that changes what the app *does* rather than
            how it looks, and the only one that ships off: invariant 1 says
            the app does not edit a player's marks unless asked, and this is
            where the asking happens. */}
        <Toggle
          label={t('settings.autoClearDeadNotes')}
          checked={profile.settings.autoClearDeadNotes}
          onChange={(autoClearDeadNotes) => onSettings({ autoClearDeadNotes })}
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
