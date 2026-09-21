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
 * and a verdict, and works out none of them. It *renders* roles and
 * eliminations once a check has produced them, which is not the same as
 * knowing what a pivot or a conjugate pair is — it is handed the cells and
 * puts names to them.
 */

import type { ChainVerdict } from '../../engine/claim';
import type { ClaimShape } from './shape';
import type { CellIndex, Digit, Elimination, TechniqueId } from '../../engine/types';
import { cellName } from '../../engine/board';
import { Button } from '../primitives/Button';
import { useT } from '../../i18n/locale';
import { cx } from '../primitives/cx';

export type ClaimStage = 'technique' | 'cells' | 'verdict';

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
  /**
   * How many cells this technique takes, or `null` where that is not fixed.
   * Passed in rather than derived from `shape`: a fish's size is a property of
   * the technique, not of being a fish — an X-Wing has four corners and a
   * Swordfish six.
   */
  size: number | null;
  holds: boolean | null;
  chain: ChainVerdict | null;
  /**
   * The roles a checked wing turned out to have. `null` before the check and
   * on anything that is not a wing — the board draws the three cells alike
   * until then, and this says nothing either.
   */
  roles: { pivot: CellIndex; wings: readonly CellIndex[] } | null;
  /** What a verified claim clears. Empty unless it holds and pays. */
  eliminations: readonly Elimination[];
  /** The player has already taken them off; the offer is spent. */
  applied: boolean;
  onApply: () => void;
  onTechnique: (id: TechniqueId) => void;
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
  size,
  holds,
  chain,
  roles,
  eliminations,
  applied,
  onApply,
  onTechnique,
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

      {stage === 'cells' ? (
        <>
          <p className="text-ink-faint">
            {shape === 'chain'
              ? t('claim.prompt.chain')
              : t(shape === 'wing' ? 'claim.prompt.wing' : 'claim.prompt.set')}
            {/* Where you are, for the shapes that have a destination. The
                board stops taking cells at the size, and a limit the player
                cannot see is a limit that reads as the app ignoring them. */}
            {size === null ? null : (
              <span className="ml-1 tabular-nums text-ink-soft">
                {t('claim.taken', { taken: cells.length, total: size })}
              </span>
            )}
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
            disabled={size === null ? cells.length < 3 : cells.length !== size}
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
                ? t(
                    chain.eliminations.length === 1
                      ? 'claim.verdict.chainProvesOne'
                      : 'claim.verdict.chainProves',
                    {
                      // Plural because a chain can hold for two digits at
                      // once — rare, but real, and naming only one of them
                      // would be the app deciding which one the player meant.
                      digits: chain.digits.join(' and '),
                      count: String(chain.eliminations.length),
                    },
                  )
                : chain?.kind === 'barren'
                  ? // Not a failure. The player did the technique correctly
                    // and it happens to pay nothing; calling that "wrong"
                    // would teach them to distrust a method that worked.
                    t('claim.verdict.chainBarren')
                  : // The link that fails is drawn as the link that fails, so
                    // the sentence does not have to count anything.
                    t('claim.verdict.chainBroken')}
          </p>
          {/* The roles, once the check has settled them. Before that the three
              cells are drawn alike and nothing here names them, because at
              most one of them can be the hinge and the player was never asked
              which — saying it early would be the app answering for them. */}
          {roles === null ? null : (
            <p className="text-ink-soft">
              {t('claim.roles.wing', {
                pivot: cellName(roles.pivot),
                wings: roles.wings.map(cellName).join(' and '),
              })}
            </p>
          )}

          {/* What it buys, and the offer to write it down. The board has the
              amber squares; this is the sentence and the button. */}
          {eliminations.length === 0 ? null : (
            <p className={applied ? 'text-match' : 'text-ink-soft'}>
              {applied
                ? t('claim.applied')
                : t(eliminations.length === 1 ? 'claim.clearsOne' : 'claim.clears', {
                    count: String(eliminations.length),
                  })}
            </p>
          )}

          <div className="flex gap-2">
            {/* Offered, never taken. The player's notes are theirs, and this
                is the same bargain `clearStaleCandidates` and the note check
                already strike: the app will do the typing once, on a press,
                for a conclusion the player reached themselves. */}
            {eliminations.length === 0 || applied ? null : (
              <Button variant="primary" size="sm" onClick={onApply}>
                {t('claim.apply')}
              </Button>
            )}
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
