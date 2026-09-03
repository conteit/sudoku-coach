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
import type { MessageKey } from '../i18n/types';
import { useRef, useState } from 'react';
import { useT } from '../i18n/locale';
import { authAvailable, useAccount } from '../state/account';
import { useSync } from '../sync/store';
import { syncAvailable } from '../sync/token';
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

/**
 * Sync's whole surface: a switch, a line of status, and the cost stated.
 *
 * Only shown to a signed-in player, because there is nothing to offer one who
 * is not — an account is what sync syncs to. Every state here is a sentence
 * rather than a dialog, which is the spec's rule for this feature: a sync that
 * failed is something the player may want to know, never something that
 * interrupts a puzzle.
 *
 * The conflict rule is written on screen on purpose. "Newest wins, whole game"
 * is a choice with a cost — the other device's version of that board is gone —
 * and a player is entitled to know it before turning this on, not after losing
 * an evening's puzzle to it.
 */
function SyncSection({ locale }: { locale: Locale }) {
  const t = useT();
  const account = useAccount((state) => state.account);
  const enabled = useSync((state) => state.enabled);
  const status = useSync((state) => state.status);
  const lastSyncedAt = useSync((state) => state.lastSyncedAt);

  if (!authAvailable() || !syncAvailable() || account === null) return null;

  const when =
    lastSyncedAt === null
      ? null
      : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          lastSyncedAt,
        );

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
        {t('sync.title')}
      </h3>

      {enabled ? (
        <>
          <p className="text-sm text-ink-soft" role="status">
            {status === 'syncing'
              ? t('sync.syncing')
              : when === null
                ? t('sync.never')
                : t('sync.lastSynced', { when })}
          </p>
          {status === 'error' ? <p className="text-sm text-danger">{t('sync.error')}</p> : null}
          {status === 'consent' ? <p className="text-sm text-danger">{t('sync.consent')}</p> : null}
          <Button
            variant="secondary"
            size="lg"
            block
            disabled={status === 'syncing'}
            onClick={() => void useSync.getState().syncNow()}
          >
            {t('sync.now')}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            block
            onClick={() => void useSync.getState().disable()}
          >
            {t('sync.disable')}
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="secondary"
            size="lg"
            block
            onClick={() => void useSync.getState().enable()}
          >
            {t('sync.enable')}
          </Button>
          <p className="text-sm leading-relaxed text-ink-soft">{t('sync.why')}</p>
        </>
      )}

      <p className="text-sm leading-relaxed text-ink-faint">{t('sync.conflict')}</p>
    </section>
  );
}

/**
 * Three tabs, and Account last.
 *
 * Settings accumulated until it did not fit a phone: an account, sync, two
 * choosers and eight switches. Capping the sheet made all of it *reachable*,
 * which is not the same as usable — a list that long is one a player scrolls
 * looking for the switch they wanted. The split is by what the settings are
 * about rather than by how many fit: what the grid draws, how the app behaves,
 * and who you are.
 *
 * Board comes first because it holds the switches anyone changes twice, and
 * Account last because it is the one most players never open at all — Paolo's
 * call. A build with no sign-in has no Account tab, rather than a tab leading
 * to an empty panel.
 */
const TAB_KEYS = {
  board: 'settings.tab.board',
  general: 'settings.tab.general',
  // Reuses the section's own word rather than minting a second one, so the tab
  // and the heading behind it can never drift apart in either language.
  account: 'account.title',
} as const satisfies Record<string, MessageKey>;

const ALL_TABS = ['board', 'general', 'account'] as const;
export type SettingsTab = (typeof ALL_TABS)[number];

function TabStrip({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly SettingsTab[];
  value: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  const t = useT();
  const buttons = useRef(new Map<SettingsTab, HTMLButtonElement | null>());

  // Arrow keys move between tabs and take focus with them; Tab leaves the
  // strip entirely. That is the ARIA pattern, and it is also what keeps the
  // sheet's focus trap short — the inactive tabs are not tab stops.
  const step = (delta: number): void => {
    const next = tabs[(tabs.indexOf(value) + delta + tabs.length) % tabs.length];
    onChange(next);
    buttons.current.get(next)?.focus();
  };

  return (
    <div role="tablist" aria-label={t('settings.title')} className="flex gap-1 border-b border-rule">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`settings-tab-${tab}`}
          aria-controls={`settings-panel-${tab}`}
          aria-selected={value === tab}
          tabIndex={value === tab ? 0 : -1}
          ref={(node) => {
            buttons.current.set(tab, node);
          }}
          onClick={() => onChange(tab)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              step(1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              step(-1);
            }
          }}
          className={cx(
            '-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-100 ease-snap',
            value === tab
              ? 'border-ink font-medium text-ink'
              : 'border-transparent text-ink-soft hover:text-ink',
          )}
        >
          {t(TAB_KEYS[tab])}
        </button>
      ))}
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

  const tabs: readonly SettingsTab[] = authAvailable()
    ? ALL_TABS
    : ALL_TABS.filter((tab) => tab !== 'account');
  const [tab, setTab] = useState<SettingsTab>('board');
  // A build can lose its sign-in between renders only in tests, but a tab that
  // is no longer offered must not stay selected and render nothing.
  const active = tabs.includes(tab) ? tab : tabs[0];

  return (
    <Sheet open={open} onClose={onClose} title={t('settings.title')}>
      <div className="flex flex-col gap-4">
        <TabStrip tabs={tabs} value={active} onChange={setTab} />

        {/* A floor rather than a fixed height: the panels differ in length and
            a sheet that resized on every tab press would be a sheet whose
            close button moves while you are reaching for it. */}
        <div
          role="tabpanel"
          id={`settings-panel-${active}`}
          aria-labelledby={`settings-tab-${active}`}
          className="flex min-h-[16rem] flex-col gap-4 pb-2"
        >
          {active === 'board' ? (
            <>
              {/* The colour the board draws, one switch per layer. They ship
                  on — this is the board as it has always looked — and exist so
                  a player who finds it noisy can quiet it a layer at a time
                  rather than choosing between all of it and none. The coach's
                  own spotlight is deliberately not here: it is not decoration,
                  it is the hint pointing. */}
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
              {/* The one switch here that changes what the app *does* rather
                  than how it looks, and the only one that ships off: invariant
                  1 says the app does not edit a player's marks unless asked,
                  and this is where the asking happens. */}
              <Toggle
                label={t('settings.autoClearDeadNotes')}
                checked={profile.settings.autoClearDeadNotes}
                onChange={(autoClearDeadNotes) => onSettings({ autoClearDeadNotes })}
              />
              {/* The other switch here that takes something away rather than
                  adding a layer: on, a cell can only receive a note of the
                  digit being swept. Off by default for that reason. */}
              <Toggle
                label={t('settings.sweepOneDigit')}
                checked={profile.settings.sweepOneDigit}
                onChange={(sweepOneDigit) => onSettings({ sweepOneDigit })}
              />
            </>
          ) : active === 'general' ? (
            <>
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
                label={t('settings.haptics')}
                checked={profile.settings.haptics}
                onChange={(haptics) => onSettings({ haptics })}
              />
            </>
          ) : (
            <>
              {/* The only place in the app that mentions an account at all,
                  apart from one invitation on the library's empty desk. Paolo
                  was explicit: no avatar, no session chrome, and nothing about
                  this in the game view. A build with no Firebase config has no
                  sign-in — not a disabled button, which would advertise a
                  feature this build does not have. */}
              <AccountSection />
              <SyncSection locale={profile.locale} />
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
