/**
 * Modal surface: a bottom sheet on a phone, a centred card from `sm` up.
 *
 * **The panel is capped and its body scrolls.** Without that a sheet taller
 * than the viewport does not overflow downwards into a scrollbar — it is laid
 * out against the bottom of a `fixed inset-0` container, so it grows *upwards*
 * past the top of the screen, taking its own title with it, and nothing on the
 * page can scroll to reach any of it. Settings crossed that line and became
 * unusable on a phone. Every sheet had the bug; Settings was only the first to
 * outgrow the screen.
 *
 * Not a `<dialog>` — `showModal` is still uneven across the jsdom/browser
 * split we test in, and the focus behaviour we want (trap, restore, escape) is
 * a dozen lines we can own outright. The sheet is the one place a shadow is
 * allowed: it is genuinely lifted off the page.
 */

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';
import { CloseIcon } from './icons';
import { cx } from './cx';
import { useT } from '../../i18n/locale';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional line under the title. */
  description?: string;
  children?: ReactNode;
  /** Actions, laid out by the caller. */
  footer?: ReactNode;
  /** Hides the corner close control for decisions that must be answered. */
  dismissible?: boolean;
}

/**
 * Exported rather than kept private: the coach sheet in `GameView` needs the
 * same tab-trap boundary but cannot use this component wholesale (below) — a
 * portal centred on the whole viewport would modalize the coach panel on
 * desktop too, where it has to stay a static, permanent bar.
 */
export const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
}: SheetProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const focusables = useCallback(
    () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    [],
  );

  // Move focus in on open and hand it back on close, so a keyboard user is
  // never dropped at the top of the document when the sheet goes away.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    (focusables()[0] ?? panelRef.current)?.focus();
    return () => restoreRef.current?.focus?.();
  }, [open, focusables]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, dismissible, focusables]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={t('action.close')}
        tabIndex={-1}
        onClick={dismissible ? onClose : undefined}
        className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[1px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          'relative flex w-full max-w-md flex-col border-t border-rule-strong bg-paper-raised',
          'shadow-lift sm:rounded-cell sm:border',
          // `dvh`, not `vh`: on a phone the browser's own chrome comes and
          // goes, and `vh` measures the tallest state — which is exactly the
          // height at which the sheet stops fitting.
          'max-h-[85dvh]',
          'pb-[max(1.25rem,env(safe-area-inset-bottom))]',
        )}
      >
        <header className="flex flex-none items-start gap-3 border-b border-rule px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg leading-tight text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-ink-soft">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <IconButton size="sm" label={t('action.close')} icon={<CloseIcon />} onClick={onClose} />
          ) : null}
        </header>
        {/* `min-h-0` is load-bearing: a flex child's default `min-height:
            auto` floors it at its content's height, so `overflow-y-auto` here
            would never actually scroll — the panel would grow instead, which
            is the bug this is fixing. `overscroll-contain` keeps a flick that
            runs out of sheet from scrolling the board behind it. */}
        {children ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {children}
          </div>
        ) : null}
        {footer ? <div className="flex flex-none gap-2 px-5 pt-1">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
