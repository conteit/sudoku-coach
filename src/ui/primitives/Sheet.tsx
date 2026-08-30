/**
 * Modal surface: a bottom sheet on a phone, a centred card from `sm` up.
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

const FOCUSABLE =
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
          'relative w-full max-w-md border-t border-rule-strong bg-paper-raised shadow-lift',
          'sm:rounded-cell sm:border',
          'pb-[max(1.25rem,env(safe-area-inset-bottom))]',
        )}
      >
        <header className="flex items-start gap-3 border-b border-rule px-5 py-4">
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
        {children ? <div className="px-5 py-4">{children}</div> : null}
        {footer ? <div className="flex gap-2 px-5 pt-1">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
