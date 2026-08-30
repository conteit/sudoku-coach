/**
 * A switch, squared off rather than the usual iOS pill so it belongs to the
 * same drawing as the grid. State is carried by the knob's position and the
 * `aria-checked` value, not by colour alone.
 */

import { useId } from 'react';
import { cx } from './cx';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** One line of supporting copy under the label. */
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ checked, onChange, label, description, disabled, className }: ToggleProps) {
  const labelId = useId();
  const descId = useId();

  return (
    <div className={cx('flex items-center justify-between gap-4', className)}>
      <span className="min-w-0">
        <span id={labelId} className="block text-sm font-medium text-ink">
          {label}
        </span>
        {description ? (
          <span id={descId} className="mt-0.5 block text-xs text-ink-soft">
            {description}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-cell border transition-colors duration-150 ease-snap',
          'disabled:pointer-events-none disabled:opacity-45',
          checked ? 'border-ink bg-ink' : 'border-rule-strong bg-paper-sunk',
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'absolute top-[2px] block size-4.5 rounded-[2px] transition-[left] duration-150 ease-snap',
            checked ? 'left-[calc(100%-1.25rem)] bg-paper' : 'left-[2px] bg-ink-faint',
          )}
        />
      </button>
    </div>
  );
}
