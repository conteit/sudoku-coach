/**
 * The coach, bound to the active game.
 *
 * This is where the disclosure ladder becomes a screen: `coach/` decides what
 * may be said and at which rung, `state/` remembers what was already said, and
 * this hook is the wiring between them. It holds no coaching rules of its own —
 * every level, every log entry and every mastery transition comes from a
 * function in `coach/`.
 *
 * Two things are deliberate:
 *
 * 1. **Detection is lazy and debounced.** A `Coach` is built from the board on
 *    demand, and the background finding used for mastery credit is recomputed
 *    only once the player stops typing. Running the detector catalog on every
 *    keystroke would put a chain search on the UI thread between two digits.
 * 2. **Credit is judged against the board as it stood before the move.**
 *    `masteryAfterMove` needs the finding that was available *before*, which is
 *    exactly the one the previous settled pass left behind.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Finding } from '../engine/types';
import {
  createCoach,
  escalatedLevel,
  findingKey,
  masteryAfterHint,
  masteryAfterMove,
  recordExchange,
  resumeLevel,
  type CoachCell,
  type HintLevel,
} from '../coach/coach';
import { teachableTriggers, type TriggerCell } from '../coach/triggers';
import type { CandidateReview, Hint, TeachableTrigger } from '../coach/types';
import { useProfile } from '../state/profile';
import type { CoachExchange, LiveGame, Locale } from '../state/types';

/** How long the board must sit still before the background pass runs. */
export const IDLE_MS = 400;

/**
 * How often a still board is re-read for a teachable moment. A stall is a fact
 * about the clock rather than about the board, so nothing else would surface it.
 */
export const NUDGE_POLL_MS = 15_000;

type LevelPicker = (log: readonly CoachExchange[], key: string) => HintLevel;

export interface CoachSession {
  hint: Hint | null;
  review: CandidateReview | null;
  /** True once a hint was asked for and the board yielded nothing. */
  exhausted: boolean;
  /** The most urgent unprompted moment, or null. Reveals nothing by itself. */
  nudge: TeachableTrigger | null;
  ask: () => void;
  escalate: () => void;
  checkMarks: () => void;
  /** Puts the panel back to rest; the log keeps what was already disclosed. */
  dismiss: () => void;
  dismissNudge: () => void;
}

export interface CoachSessionInput {
  game: LiveGame;
  locale: Locale;
  /** Hands the recomputed exchange log back to the reducer. */
  onCoachLog: (log: readonly CoachExchange[]) => void;
  now?: () => number;
}

const coachCells = (game: LiveGame): CoachCell[] =>
  game.cells.map((cell) => ({ value: cell.value, candidates: cell.candidates }));

const triggerCells = (game: LiveGame): TriggerCell[] =>
  game.cells.map((cell) => ({
    value: cell.value,
    candidates: cell.candidates,
    given: cell.given,
  }));

/** Identity of a nudge, so dismissing one does not silence the next. */
export const triggerKey = (trigger: TeachableTrigger): string => {
  switch (trigger.kind) {
    case 'contradiction':
      return `contradiction:${trigger.cell}`;
    case 'stale_marks':
      return `stale_marks:${trigger.cells.join(',')}`;
    case 'stuck':
      return 'stuck';
  }
};

export function useCoachSession({
  game,
  locale,
  onCoachLog,
  now = Date.now,
}: CoachSessionInput): CoachSession {
  const [hint, setHint] = useState<Hint | null>(null);
  const [review, setReview] = useState<CandidateReview | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [nudge, setNudge] = useState<TeachableTrigger | null>(null);
  const [dismissedNudge, setDismissedNudge] = useState<string | null>(null);

  const updateProfile = useProfile((state) => state.update);

  /**
   * The board and its finding as of the last settled pass, tagged with the game
   * it came from: credit for a move must never be carried across a switch to
   * another board.
   */
  const settled = useRef<{ game: string; cells: CoachCell[]; finding: Finding | null } | null>(
    null,
  );
  const [shownGame, setShownGame] = useState(game.id);
  const [shownLocale, setShownLocale] = useState(locale);

  // Switching games throws the panel away: a hint about another board is worse
  // than no hint at all.
  if (shownGame !== game.id) {
    setShownGame(game.id);
    setHint(null);
    setReview(null);
    setExhausted(false);
    setNudge(null);
    setDismissedNudge(null);
  }

  // A hint already on screen is re-rendered when the language changes: same
  // rung of the same finding, nothing new disclosed — but a panel left in the
  // language the player just switched away from would be the one piece of the
  // app that ignored them.
  if (shownLocale !== locale) {
    setShownLocale(locale);
    setReview(null);
    if (hint !== null) {
      const coach = createCoach({ cells: coachCells(game), locale });
      const finding = coach.nextFinding();
      setHint(finding === null ? null : coach.hint(finding, hint.level));
    }
  }

  /**
   * Mastery credit for the move that produced this board, then a fresh reading
   * for the next one. Both run after the player has stopped, so a run of pencil
   * marks costs one detector pass rather than one per key.
   */
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    const handle = setTimeout(() => {
      const after = coachCells(game);
      const before = settled.current;
      const finding = createCoach({ cells: after, locale }).nextFinding();

      const priorFinding = before?.game === game.id ? before.finding : null;
      if (before !== null && priorFinding !== null) {
        const at = now();
        updateProfile((profile) =>
          masteryAfterMove({
            profile,
            log: game.coachLog,
            finding: priorFinding,
            before: before.cells,
            after,
            at,
          }),
        );
      }
      settled.current = { game: game.id, cells: after, finding };

      const cells = triggerCells(game);
      const evaluate = (): void => {
        const top =
          teachableTriggers({
            cells,
            now: now(),
            lastActionAt: game.updatedAt,
            finding,
            solution: game.solution,
            moves: game.undoStack,
          })[0] ?? null;
        setNudge(top !== null && triggerKey(top) !== dismissedNudge ? top : null);
      };

      evaluate();
      interval = setInterval(evaluate, NUDGE_POLL_MS);
    }, IDLE_MS);

    return () => {
      clearTimeout(handle);
      if (interval !== undefined) clearInterval(interval);
    };
    // `game` is replaced wholesale by the reducer on every change, so it is the
    // honest dependency: one pass per board, not one per render.
  }, [game, locale, dismissedNudge, now, updateProfile]);

  const show = useCallback(
    (pickLevel: LevelPicker) => {
      const coach = createCoach({ cells: coachCells(game), locale });
      const finding = coach.nextFinding();
      if (finding === null) {
        setHint(null);
        setExhausted(true);
        return;
      }
      const next = coach.hint(finding, pickLevel(game.coachLog, findingKey(finding)));
      const at = now();
      // Mastery reads the log as it stood *before* this exchange, so the order
      // here is load-bearing: crediting after the append would score every
      // first hint as a repeat of itself.
      updateProfile((profile) => masteryAfterHint(profile, game.coachLog, next, at));
      onCoachLog(recordExchange(game.coachLog, next, at));
      setExhausted(false);
      setHint(next);
    },
    [game, locale, now, onCoachLog, updateProfile],
  );

  const ask = useCallback(() => show(resumeLevel), [show]);
  const escalate = useCallback(() => show(escalatedLevel), [show]);

  const checkMarks = useCallback(() => {
    setReview(createCoach({ cells: coachCells(game), locale }).reviewCandidates());
  }, [game, locale]);

  const dismiss = useCallback(() => {
    setHint(null);
    setReview(null);
    setExhausted(false);
  }, []);

  const dismissNudge = useCallback(() => {
    setNudge((current) => {
      if (current !== null) setDismissedNudge(triggerKey(current));
      return null;
    });
  }, []);

  return { hint, review, exhausted, nudge, ask, escalate, checkMarks, dismiss, dismissNudge };
}
