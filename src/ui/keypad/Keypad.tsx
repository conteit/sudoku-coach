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

import { useEffect, useMemo, useRef } from 'react';
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
  /**
   * Held past `LONG_PRESS_MS` without releasing. The only way to arm the
   * green highlight on a digit that has none of its nine placed yet — a tap
   * only ever enters, so there is no cell for the grid's own arm/clear rule
   * (R3) to work from. Optional: a host that never wires it just gets a key
   * whose long-press does nothing, not a broken one.
   */
  onDigitLongPress?: (digit: Digit) => void;
  onErase: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /**
   * There is a cell to erase — i.e. one is selected. The digits deliberately
   * stay live with nothing selected — a long-press still has to reach a
   * digit with none of its nine placed yet (R3) — but "erase" with no target
   * is a key that can only do nothing.
   */
  canErase?: boolean;
  /**
   * How many pencil marks a placement of the player's own has killed.
   *
   * While there are any, the eraser *is* the clear: the key reads "Clear 3
   * dead notes" and does that, and the ordinary cell erase waits until they
   * are gone. Clearing first is the point — the alternative was a coach sheet
   * two taps away from a thumb that is already here — and Undo, one key over,
   * is the better answer to the mis-tap the erase would otherwise fix.
   *
   * The count is a reading of the board, not a mode the pad remembers: the
   * key goes back to erasing the moment the host says the notes are gone.
   */
  staleCount?: number;
  /** Clears every dead note in one undoable step. Without it the key just erases. */
  onClearStale?: () => void;
  /** The board is paused or already solved — no move is legal right now. */
  disabled?: boolean;
  /** The digit the board's green layer is on, so the key that controls it looks like it does. */
  highlighted?: Digit | null;
  /** Fired before each action so the host can vibrate. Optional by design. */
  onHaptic?: (pattern: HapticPattern) => void;
  className?: string;
}

/**
 * Long enough that every ordinary tap — the key's primary, single-purpose
 * action now — resolves as a tap, short enough that arming a digit that
 * isn't on the board yet doesn't feel like a broken key.
 */
const LONG_PRESS_MS = 500;

/**
 * How far a pointer can drift before a held press is cancelled. Needed
 * specifically for touch: a touch pointer gets *implicit* capture on
 * `pointerdown`, so `pointerleave`/`pointerout` are not dispatched while the
 * finger is still down and moving across other keys — they are deferred
 * until release. `pointermove` is the only event that still reaches this key
 * while the finger has wandered off it, so it is the only reliable way to
 * honour a drag-off-to-cancel gesture on a touchscreen.
 */
const MOVE_CANCEL_PX = 10;

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
  onDigitLongPress,
  onErase,
  onUndo,
  onRedo,
  canUndo = true,
  canRedo = true,
  canErase = true,
  staleCount = 0,
  onClearStale,
  disabled = false,
  highlighted = null,
  onHaptic,
  className,
}: KeypadProps) {
  const t = useT();
  const remaining = useMemo(() => remainingCounts(values), [values]);
  /* Optional-by-design, like `onDigitLongPress`: a host that wires no clear
     gets today's eraser rather than a key whose label promises something
     nothing is listening for. */
  const clearing = staleCount > 0 && onClearStale !== undefined;

  const fire = (pattern: HapticPattern, action: () => void) => {
    onHaptic?.(pattern);
    action();
  };

  /**
   * Only one key can be under a pointer at a time, so a single ref tracks the
   * press in flight rather than one per digit. `fired` is what a click
   * handler checks to tell a long-press's release from an ordinary tap: a
   * pointer that was down long enough for the timer to fire still ends in a
   * `click` on release (that is how buttons work, mouse or touch), and the
   * long-press already did its thing — the click has to be swallowed, not
   * treated as a second action. `x`/`y` are the down coordinates, for
   * `trackMove` below.
   */
  const press = useRef<{
    digit: Digit | null;
    timer: ReturnType<typeof setTimeout> | null;
    fired: boolean;
    x: number;
    y: number;
  }>({
    digit: null,
    timer: null,
    fired: false,
    x: 0,
    y: 0,
  });

  const startPress = (digit: Digit, x: number, y: number) => {
    press.current.digit = digit;
    press.current.fired = false;
    press.current.x = x;
    press.current.y = y;
    press.current.timer = setTimeout(() => {
      press.current.fired = true;
      // Nothing to feel if there is nothing wired to do: firing the haptic
      // unconditionally would vibrate for a press that has no effect at all.
      if (onDigitLongPress) fire('toggle', () => onDigitLongPress(digit));
    }, LONG_PRESS_MS);
  };

  const endPress = () => {
    if (press.current.timer === null) return;
    clearTimeout(press.current.timer);
    press.current.timer = null;
  };

  /**
   * A touch pointer keeps delivering `pointermove` to the key it started on
   * even after the finger has wandered onto a neighbour (implicit capture —
   * see `MOVE_CANCEL_PX`'s comment), so this is what makes "drag off to
   * cancel" work on a touchscreen. `pointerleave` stays wired too, for a
   * mouse, which gets no such capture.
   */
  const trackMove = (x: number, y: number) => {
    if (press.current.timer === null) return;
    const dx = x - press.current.x;
    const dy = y - press.current.y;
    if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) endPress();
  };

  // A press left pending by an unmount (the game paused or exited mid-hold)
  // is otherwise a live timer nothing ever clears — exactly the unbounded-
  // timer hygiene a long-running session cannot afford. Captured as `state`
  // rather than read via `press.current` inside the cleanup: `press` itself
  // is never reassigned to a new object (only its fields mutate in place),
  // so `state` and `press.current` are the same object for the component's
  // whole life — this just satisfies the rule that a cleanup should not
  // dereference `.current` directly, without losing the live timer id.
  useEffect(() => {
    const state = press.current;
    return () => {
      if (state.timer !== null) clearTimeout(state.timer);
    };
  }, []);

  return (
    <div
      className={cx('flex w-full flex-col', className)}
      data-pencil={pencilMode || undefined}
      aria-label={pencilMode ? t('keypad.labelNotes') : t('keypad.label')}
      role="group"
    >
      {/* The keys take whatever height the board did not, rather than leaving a
          gap between the two: a bigger target is the only thing that space can
          usefully become. */}
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-3 gap-1.5">
        {DIGITS.map((digit) => {
          // The count is still what decides a digit is finished; it is just no
          // longer printed under every key. Nine little numbers cost a line of
          // height each on a phone, and none of them is a move.
          const done = remaining[digit] === 0;
          return (
            <button
              key={digit}
              type="button"
              disabled={disabled || done}
              onPointerDown={(event) => startPress(digit, event.clientX, event.clientY)}
              onPointerMove={(event) => trackMove(event.clientX, event.clientY)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onPointerCancel={endPress}
              // The platform's own long-press has to lose to this one: on
              // iOS Safari a 500ms hold on selectable text raises the
              // selection callout, and on Android Chrome it starts a text
              // selection — both on the one route to arming a digit that
              // isn't on the board yet. `select-none touch-none` (the board
              // never scrolls under this key) plus swallowing the resulting
              // context-menu gesture is what keeps the long-press this
              // component's own.
              onContextMenu={(event) => event.preventDefault()}
              onClick={(event) => {
                // A long-press's release still ends in a click — that is how
                // buttons work regardless of pointer type — and the press
                // already did its one thing, so this tap is swallowed rather
                // than also entering the digit. Gated on `event.detail !== 0`
                // (0 for a keyboard activation, 1+ for a real pointer click):
                // a press abandoned mid-gesture — dragged off and released
                // somewhere that never dispatches this key's own click —
                // leaves `fired` stale-true with no click here to clear it,
                // and without this gate a later Enter/Space on the same key
                // would silently swallow itself against that leftover state.
                if (event.detail !== 0 && press.current.fired && press.current.digit === digit) {
                  press.current.fired = false;
                  return;
                }
                // The haptic for this one lives in the host: only it knows
                // whether the tap actually has a cell to write into, and
                // 'blocked' exists precisely so a no-op tap does not feel
                // identical to one that worked.
                onDigit(digit);
              }}
              aria-label={pencilMode ? t('keypad.note', { digit }) : t('keypad.place', { digit })}
              // No aria-pressed: the key's own activation — a tap, or Enter/
              // Space from focus — always enters the digit, never toggles
              // anything, so a toggle-button role would promise a screen
              // reader something Enter/Space does not do. What actually
              // toggles this state is a long-press, which has no keyboard
              // equivalent at all (by design — the grid's own arm/clear is
              // fully keyboard-reachable, see `selectHighlight`), so there is
              // no honest way to expose it as this control's own pressed
              // state. `data-highlighted` below still carries it for sighted
              // and visual-regression use.
              data-digit={digit}
              data-complete={done || undefined}
              data-highlighted={digit === highlighted ? 'true' : undefined}
              className={cx(
                'group flex min-h-12 flex-col items-stretch rounded-cell border select-none touch-none',
                'transition-[background-color,border-color,transform] duration-100 ease-snap',
                'active:translate-y-px disabled:pointer-events-none',
                done
                  ? 'border-rule bg-transparent opacity-45'
                  : 'border-rule-strong bg-paper-raised hover:bg-paper-sunk',
                disabled && 'opacity-45',
                digit === highlighted && 'ring-2 ring-match',
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
        {/* One key, one meaning at a time — a pad offering "erase" and
            "clear" at once is a pad the player has to read before every tap.
            The caption is the same word in both modes on purpose: "Erase" /
            "Cancella" is true of a cell and of a dead note, so the mode costs
            no new copy and no second translation to keep honest. The count
            rides the glyph, and the accessible name carries it in full. */}
        {clearing ? (
          <IconButton
            label={
              staleCount === 1
                ? t('action.clearStaleOne')
                : t('action.clearStaleCount', { count: staleCount })
            }
            caption={t('keypad.captionErase')}
            icon={
              <span className="relative">
                <EraserIcon />
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-2 min-w-4 rounded-full bg-coach px-1 text-[0.625rem] leading-4 font-semibold text-paper tabular-nums"
                >
                  {staleCount}
                </span>
              </span>
            }
            // `canErase` asks whether a cell is selected, which is the wrong
            // question for a key about to clear notes all over the board.
            // `disabled` still applies: clearing goes on the undo stack like
            // any other move, and a paused board takes none.
            disabled={disabled}
            onClick={() => fire('tap', onClearStale)}
          />
        ) : (
          <IconButton
            label={t('keypad.erase')}
            caption={t('keypad.captionErase')}
            icon={<EraserIcon />}
            disabled={disabled || !canErase}
            onClick={() => fire('tap', onErase)}
          />
        )}
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
