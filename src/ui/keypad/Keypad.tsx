/**
 * Digit entry.
 *
 * The pad is a 3x3 box, not a 1x9 strip: nine keys across a 360px phone leaves
 * ~36px targets, under the 44px floor, and the box shape is the same geometry
 * the player is already reading on the board. It sits at the bottom of the
 * screen inside the safe area, where a thumb actually is.
 *
 * Each key carries how many of that digit are still unplaced. It costs one
 * pass over the values and it is the number a solver keeps in their head
 * anyway. In notes mode the key shows the digit in the 3x3 slot the mark will
 * land in, so the mode is legible from the key itself and not only from the
 * toggle.
 *
 * Presentational: it reads `values` to count, and reports every action up.
 */

import { useMemo } from 'react';
import type { Digit } from '../../engine/types';
import { DIGITS } from '../../engine/types';
import { IconButton } from '../primitives/IconButton';
import { EraserIcon, PencilIcon, RedoIcon, UndoIcon } from '../primitives/icons';
import { cx } from '../primitives/cx';
import { useT } from '../../i18n/locale';

/** A short vibration hint the host can route to the Vibration API. */
export type HapticPattern = 'tap' | 'toggle' | 'blocked';

export interface KeypadProps {
  /** Board values, used only to count what is left. */
  values: readonly (Digit | null)[];
  pencilMode: boolean;
  onTogglePencil: () => void;
  onDigit: (digit: Digit) => void;
  onErase: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** No cell selected yet — the digits have nowhere to go. */
  disabled?: boolean;
  /** Fired before each action so the host can vibrate. Optional by design. */
  onHaptic?: (pattern: HapticPattern) => void;
  className?: string;
}

/** 9 minus placements, floored at 0 so a contradictory board never goes negative. */
function remainingCounts(values: readonly (Digit | null)[]): Record<Digit, number> {
  const counts = { 1: 9, 2: 9, 3: 9, 4: 9, 5: 9, 6: 9, 7: 9, 8: 9, 9: 9 } as Record<Digit, number>;
  for (const value of values) if (value !== null) counts[value] -= 1;
  for (const digit of DIGITS) counts[digit] = Math.max(0, counts[digit]);
  return counts;
}

export function Keypad({
  values,
  pencilMode,
  onTogglePencil,
  onDigit,
  onErase,
  onUndo,
  onRedo,
  canUndo = true,
  canRedo = true,
  disabled = false,
  onHaptic,
  className,
}: KeypadProps) {
  const t = useT();
  const remaining = useMemo(() => remainingCounts(values), [values]);

  const fire = (pattern: HapticPattern, action: () => void) => {
    onHaptic?.(pattern);
    action();
  };

  return (
    <div
      className={cx('w-full', className)}
      data-pencil={pencilMode || undefined}
      aria-label={pencilMode ? t('keypad.labelNotes') : t('keypad.label')}
      role="group"
    >
      <div className="grid grid-cols-3 gap-1.5">
        {DIGITS.map((digit) => {
          const left = remaining[digit];
          const done = left === 0;
          return (
            <button
              key={digit}
              type="button"
              disabled={disabled || done}
              onClick={() => fire('tap', () => onDigit(digit))}
              aria-label={
                pencilMode
                  ? t('keypad.note', { digit, left })
                  : t('keypad.place', { digit, left })
              }
              data-digit={digit}
              data-complete={done || undefined}
              className={cx(
                'group flex min-h-14 flex-col items-stretch rounded-cell border',
                'transition-[background-color,border-color,transform] duration-100 ease-snap',
                'active:translate-y-px disabled:pointer-events-none',
                done
                  ? 'border-rule bg-transparent opacity-45'
                  : 'border-rule-strong bg-paper-raised hover:bg-paper-sunk',
                disabled && 'opacity-45',
              )}
            >
              <span className="relative grid flex-1 place-items-center">
                {pencilMode ? (
                  <span aria-hidden="true" className="grid size-full grid-cols-3 grid-rows-3 p-1.5">
                    {DIGITS.map((slot) => (
                      <span
                        key={slot}
                        className="grid place-items-center text-[0.625rem] leading-none tabular-nums"
                      >
                        {slot === digit ? <span className="text-ink">{digit}</span> : null}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span aria-hidden="true" className="digit text-[1.75rem] text-ink">
                    {digit}
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                className="border-t border-rule py-0.5 text-center text-[0.625rem] font-medium tracking-[0.08em] text-ink-faint tabular-nums"
              >
                {done ? t('keypad.done') : t('keypad.left', { left })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        <IconButton
          label={pencilMode ? t('keypad.notesOn') : t('keypad.notesOff')}
          caption={t('keypad.captionNotes')}
          icon={<PencilIcon />}
          pressed={pencilMode}
          onClick={() => fire('toggle', onTogglePencil)}
        />
        <IconButton
          label={t('keypad.erase')}
          caption={t('keypad.captionErase')}
          icon={<EraserIcon />}
          disabled={disabled}
          onClick={() => fire('tap', onErase)}
        />
        <IconButton
          label={t('action.undo')}
          caption={t('keypad.captionUndo')}
          icon={<UndoIcon />}
          disabled={!canUndo}
          onClick={() => fire('tap', onUndo)}
        />
        <IconButton
          label={t('action.redo')}
          caption={t('keypad.captionRedo')}
          icon={<RedoIcon />}
          disabled={!canRedo}
          onClick={() => fire('tap', onRedo)}
        />
      </div>
    </div>
  );
}
