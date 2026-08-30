/**
 * A decision that cannot be undone gets a sheet, and the sheet names the
 * action rather than saying "OK" — the button the player presses reads the
 * same as the thing that happens ("Reset board"), so nobody confirms a verb
 * they did not choose.
 */

import { Button } from '../primitives/Button';
import { Sheet } from '../primitives/Sheet';
import { useT } from '../../i18n/locale';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, and what it costs. */
  body: string;
  /** The action, phrased as the verb it performs. */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions get the danger treatment; the default is neutral. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  const cancel = cancelLabel ?? t('action.keepPlaying');
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      description={body}
      footer={
        <>
          <Button variant="ghost" size="lg" block onClick={onCancel}>
            {cancel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="lg"
            block
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
