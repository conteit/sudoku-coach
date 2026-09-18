/**
 * The claim surface: the player naming a pattern instead of asking for one.
 *
 * It lives in the **keypad's box** and takes the keypad's own `PAD_SLOT`, for
 * two reasons that happen to agree. A claim places no digits, so the pad is
 * exactly the space that can be spent on it — no new chrome on any of the
 * three arrangements. And the digits being visibly *gone* is what makes a tap
 * on a cell unambiguous: the board means something different while this is
 * open, and it says so by what it has taken away rather than by a mode badge
 * or a gesture nobody taught.
 *
 * Strictly presentational, like `CoachPanel`: it is handed a stage, a shape
 * and a verdict, and knows nothing about pivots, conjugate pairs or which
 * techniques the engine can check.
 */

import type { ChainVerdict } from '../../engine/claim';
import type { ClaimShape } from './shape';
import type { CellIndex, Digit, TechniqueId } from '../../engine/types';
import { DIGITS } from '../../engine/types';
import { cellName } from '../../engine/board';
import { Button } from '../primitives/Button';
import { useT } from '../../i18n/locale';
import { cx } from '../primitives/cx';

export type ClaimStage = 'technique' | 'digit' | 'cells' | 'verdict';

/**
 * A claim comes in three shapes, and flattening them into one was the first
 * mistake this design made. A `set` is a bag of cells whose order carries nothing — the four
 * corners of a fish are interchangeable. A `chain` is a sequence: the links
 * and their alternation *are* the technique. A `wing` is three cells of which
 * one is doing something different from the other two.
 */
export type { ClaimShape } from './shape';

export interface ClaimPanelProps {
  stage: ClaimStage;
  shape: ClaimShape;
  /**
   * What the player may claim, already filtered by what they have been
   * taught. `all` is the same list without that filter — **never** filtered by
   * what is on the board, which would make the list itself a hint.
   */
  techniques: readonly { id: TechniqueId; name: string }[];
  all: readonly { id: TechniqueId; name: string }[];
  technique: string | null;
  showingAll: boolean;
  onShowAll: () => void;
  digit: Digit | null;
  cells: readonly CellIndex[];
  holds: boolean | null;
  chain: ChainVerdict | null;
  onTechnique: (id: TechniqueId) => void;
  onDigit: (digit: Digit) => void;
  onDropCell: (cell: CellIndex) => void;
  /** Back to the list, keeping the cells. */
  onRename: () => void;
  /** Hand over to the coach — the answer to "I cannot find it". */
  onGiveUp: () => void;
  onCheck: () => void;
  onRetry: () => void;
  onCancel: () => void;
  className?: string;
}

export function ClaimPanel({
  stage,
  shape,
  techniques,
  all,
  technique,
  showingAll,
  onShowAll,
  digit,
  cells,
  holds,
  chain,
  onTechnique,
  onDigit,
  onDropCell,
  onRename,
  onGiveUp,
  onCheck,
  onRetry,
  onCancel,
  className,
}: ClaimPanelProps) {
  const t = useT();
  return (
    <section
      aria-label={t('claim.title')}
      className={cx(
        'flex flex-col gap-2 overflow-y-auto rounded-xl bg-paper-raised p-3 text-sm',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        {/* The title is the way back. Changing your mind about the technique
            used to mean cancelling and starting over, which threw away cells
            that were very possibly right — you can misname a pattern you are
            pointing at correctly. */}
        {technique === null ? (
          <h2 className="font-semibold text-ink">{t('claim.pick')}</h2>
        ) : (
          <Button variant="ghost" size="sm" className="!px-0 font-semibold" onClick={onRename}>
            {technique}
            {digit === null ? '' : ` on ${digit}`} ▾
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('claim.cancel')}
        </Button>
      </div>

      {stage === 'technique' ? (
        <>
          {/* A player who has met none of them gets a sentence, not an empty
              box with a button under it. What they have been taught gates the
              *list*, not the right to try. */}
          {showingAll || techniques.length > 0 ? null : (
            <p className="text-ink-faint">{t('claim.none')}</p>
          )}
          <ul className="flex flex-wrap gap-1.5 empty:hidden">
            {(showingAll ? all : techniques).map(({ id, name }) => (
              <li key={id}>
                <Button variant="secondary" size="sm" onClick={() => onTechnique(id)}>
                  {name}
                </Button>
              </li>
            ))}
          </ul>
          {/* The list is what the player has been taught, so it says the same
              thing on every board and discloses nothing about this one. The
              way past it is offered rather than assumed: a technique you have
              not met is one you are unlikely to be claiming, but nothing here
              is entitled to decide that for you. */}
          {showingAll || all.length === techniques.length ? null : (
            <Button variant="ghost" size="sm" className="self-start" onClick={onShowAll}>
              {t('claim.showAll')}
            </Button>
          )}
        </>
      ) : null}

      {stage === 'digit' ? (
        <>
          <p className="text-ink-faint">{t('claim.digit')}</p>
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
          <p className="text-ink-faint">
            {shape === 'chain'
              ? t('claim.prompt.chain', { digit: String(digit ?? '') })
              : t(shape === 'wing' ? 'claim.prompt.wing' : 'claim.prompt.set')}
          </p>
          {/* A chain's chips are numbered and drop everything after them: you
              cannot pull a link out of the middle and still have a chain. */}
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
            disabled={
              shape === 'chain'
                ? cells.length < 3
                : cells.length !== (shape === 'wing' ? 3 : 4)
            }
            onClick={onCheck}
          >
            {t('claim.check')}
          </Button>
        </>
      ) : null}

      {stage === 'verdict' ? (
        <>
          {/* One sentence, and the same one whatever went wrong: "not a
              pattern at all" and "right cells, wrong digit" would be a graded
              hint channel, which invariant 4 forbids as surely as prose. */}
          <p
            role="status"
            className={holds === true || chain?.kind === 'proves' ? 'text-match' : 'text-ink'}
          >
            {shape !== 'chain'
              ? holds === true
                ? // The digit is told, not asked: it follows from the cells
                  // once the technique is named, and saying which one it was
                  // is part of confirming the claim.
                  digit === null
                  ? t('claim.verdict.holdsPlain')
                  : t('claim.verdict.holds', { digit: String(digit) })
                : t('claim.verdict.no')
              : chain?.kind === 'proves'
                ? t(chain.cells === 1 ? 'claim.verdict.chainProvesOne' : 'claim.verdict.chainProves', {
                    digit: String(digit ?? ''),
                    count: String(chain.cells),
                  })
                : chain?.kind === 'barren'
                  ? // Not a failure. The player did the technique correctly
                    // and it happens to pay nothing; calling that "wrong"
                    // would teach them to distrust a method that worked.
                    t('claim.verdict.chainBarren')
                  : // The link that fails is drawn as the link that fails, so
                    // the sentence does not have to count anything.
                    t('claim.verdict.chainBroken')}
          </p>
          <div className="flex gap-2">
            {holds === true || chain?.kind === 'proves' ? null : (
              <Button variant="primary" size="sm" onClick={onRetry}>
                {t('claim.retry')}
              </Button>
            )}
            {holds === true || chain?.kind === 'proves' ? null : (
              <Button variant="secondary" size="sm" onClick={onGiveUp}>
                {t('claim.askCoach')}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onCancel}>
              {t('claim.done')}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
