/**
 * A square control whose only content is a glyph, so the accessible name has
 * to come from `label` — it is required, not optional, and doubles as the
 * tooltip. Sizes start at 44px because these live in the thumb zone.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required accessible name. Also the title attribute. */
  label: string;
  icon: ReactNode;
  /** Pressed state for toggles; omit for plain actions. */
  pressed?: boolean;
  size?: 'sm' | 'md';
  /** Optional caption under the glyph, for the keypad's tool row. */
  caption?: string;
}

export function IconButton({
  label,
  icon,
  pressed,
  size = 'md',
  caption,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cx(
        'inline-flex flex-col items-center justify-center rounded-cell border',
        'transition-[background-color,border-color,color,transform] duration-100 ease-snap',
        'active:translate-y-px disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'size-9 text-[1.05rem]' : 'min-h-11 min-w-11 flex-1 py-1.5 text-[1.3rem]',
        pressed
          ? 'border-ink bg-ink text-paper'
          : 'border-rule bg-paper-raised text-ink-soft hover:border-rule-strong hover:text-ink',
        className,
      )}
      {...rest}
    >
      <span className="leading-none">{icon}</span>
      {caption ? (
        <span className="mt-1 text-[0.5625rem] font-medium tracking-[0.14em] uppercase">
          {caption}
        </span>
      ) : null}
    </button>
  );
}
