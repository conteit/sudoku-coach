/**
 * The one button in the app.
 *
 * Ink & Paper rules: rectangles with the 3px cell radius rather than pills, a
 * hairline rule instead of a shadow, and a press that moves 1px on
 * `--ease-snap` so the control feels stamped rather than floaty. Exactly one
 * variant is filled — if two filled buttons ever end up side by side, one of
 * them is the wrong variant.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'coach' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading glyph. Decorative: the label always carries the meaning. */
  icon?: ReactNode;
  /** Renders full width — used inside sheets and the keypad footer. */
  block?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-paper border border-ink hover:bg-ink-soft hover:border-ink-soft ' +
    'disabled:bg-ink-faint disabled:border-ink-faint',
  secondary: 'bg-paper-raised text-ink border border-rule-strong hover:bg-paper-sunk',
  ghost: 'bg-transparent text-ink-soft border border-transparent hover:text-ink hover:bg-paper-sunk',
  coach: 'bg-coach-wash text-coach border border-coach/35 hover:border-coach/60',
  danger: 'bg-danger-wash text-danger border border-danger/35 hover:border-danger/60',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[0.8125rem] gap-1.5',
  md: 'h-10 px-3.5 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2.5',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  block = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center rounded-cell font-medium',
        'transition-[background-color,border-color,color,transform] duration-100 ease-snap',
        'active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon ? <span className="text-[1.15em] leading-none">{icon}</span> : null}
      {children}
    </button>
  );
}
