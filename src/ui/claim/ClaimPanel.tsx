/**
 * SPIKE (#140) — throwaway. Delete this file, do not build on it.
 *
 * The crudest thing that answers the one question reasoning cannot: on a real
 * phone, in the box the keypad occupies, is claiming a technique usable at
 * all? Copy is hardcoded English on purpose — a spike that spends an evening
 * in `i18n/it.ts` is a spike that was designed instead of tried.
 *
 * What it is faithful about, because these are the things being judged:
 *
 * - It lives in the **keypad's box** and takes the keypad's own
 *   `min-h-[11.5rem] shrink-0`, so the board keeps its geometry exactly
 *   (invariant 9) and the digits are visibly *gone* while a claim is open —
 *   which is what makes a tap on a cell unambiguous without a new gesture.
 * - It shows all fourteen techniques, which is the **worst case** for space.
 *   The shipped list would be filtered to what the player has been taught,
 *   typically three to six; if fourteen is bearable here, the real one is.
 */

import type { CellIndex, Digit, TechniqueId } from '../../engine/types';
import { DIGITS } from '../../engine/types';
import { cellName } from '../../engine/board';
import { Button } from '../primitives/Button';
import { cx } from '../primitives/cx';

export type ClaimStage = 'technique' | 'digit' | 'cells' | 'verdict';

export interface ClaimPanelProps {
  stage: ClaimStage;
  techniques: readonly { id: TechniqueId; name: string; enabled: boolean }[];
  technique: string | null;
  digit: Digit | null;
  cells: readonly CellIndex[];
  holds: boolean | null;
  onTechnique: (id: TechniqueId) => void;
  onDigit: (digit: Digit) => void;
  onDropCell: (cell: CellIndex) => void;
  onCheck: () => void;
  onRetry: () => void;
  onCancel: () => void;
  className?: string;
}

export function ClaimPanel({
  stage,
  techniques,
  technique,
  digit,
  cells,
  holds,
  onTechnique,
  onDigit,
  onDropCell,
  onCheck,
  onRetry,
  onCancel,
  className,
}: ClaimPanelProps) {
  return (
    <section
      aria-label="Your claim"
      className={cx(
        'flex flex-col gap-2 overflow-y-auto rounded-xl bg-paper-raised p-3 text-sm',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink">
          {technique === null ? 'What do you see?' : technique}
          {digit === null ? '' : ` on ${digit}`}
        </h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Never mind
        </Button>
      </div>

      {stage === 'technique' ? (
        <ul className="flex flex-wrap gap-1.5">
          {techniques.map(({ id, name, enabled }) => (
            <li key={id}>
              <Button
                variant="secondary"
                size="sm"
                disabled={!enabled}
                onClick={() => onTechnique(id)}
              >
                {name}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {stage === 'digit' ? (
        <>
          <p className="text-ink-faint">Which digit?</p>
          <ul className="flex flex-wrap gap-1.5">
            {DIGITS.map((d) => (
              <li key={d}>
                <Button variant="secondary" size="sm" onClick={() => onDigit(d)}>
                  {d}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {stage === 'cells' ? (
        <>
          <p className="text-ink-faint">Tap the four corners on the board.</p>
          <ul className="flex flex-wrap gap-1.5">
            {cells.map((cell) => (
              <li key={cell}>
                <Button variant="secondary" size="sm" onClick={() => onDropCell(cell)}>
                  {cellName(cell)} ✕
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            size="sm"
            className="self-start"
            disabled={cells.length !== 4}
            onClick={onCheck}
          >
            Check
          </Button>
        </>
      ) : null}

      {stage === 'verdict' ? (
        <>
          {/* One sentence, and the same one whatever went wrong: "not a
              pattern at all" and "right cells, wrong digit" would be a graded
              hint channel, which invariant 4 forbids as surely as prose. */}
          <p role="status" className={holds === true ? 'text-match' : 'text-ink'}>
            {holds === true
              ? `Yes — that is an X-Wing on ${digit}. Every other ${digit} in those two lines can go.`
              : `Those cells are not an X-Wing on ${digit}.`}
          </p>
          <div className="flex gap-2">
            {holds === true ? null : (
              <Button variant="primary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Done
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
