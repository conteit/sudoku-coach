/**
 * The notes a placement killed, as opposed to the notes that were never true.
 *
 * `Board.staleAt` answers "is this digit already held by a peer", which is a
 * timeless question and the wrong one to draw on the board: it strikes a note
 * through the instant it is written next to a peer, and doing the elimination
 * for the player is the one thing this app does not do. The question worth
 * drawing is "did a move I made *after* writing this note kill it" — that is
 * bookkeeping about the player's own placement, not a deduction taken away
 * from them.
 *
 * Both timestamps are already in the move log, so the answer is derived rather
 * than stored: it survives undo, redo and a reload with no change to the
 * persisted `Game` shape.
 */

import type { Cell, CellIndex, Digit } from '../engine/types';
import { CELL_COUNT, PEERS } from '../engine/board';
import type { Move } from './types';

/** Ascending dead digits per cell, index-aligned with `cells`. */
export function deadNotes(
  cells: readonly Cell[],
  moves: readonly Move[],
): readonly (readonly Digit[])[] {
  // When each cell last received a value from a move. A given was never
  // placed by the player, so it has no entry and can never kill anything.
  const placedAt = new Map<CellIndex, number>();
  // When each note was last written. Keyed cell*10+digit to keep it one map.
  const notedAt = new Map<number, number>();

  for (const move of moves) {
    if (move.kind === 'set') {
      placedAt.set(move.cell, move.at);
    } else if (move.kind === 'addCandidate' && move.digit !== undefined) {
      notedAt.set(move.cell * 10 + move.digit, move.at);
    } else if (move.kind === 'fillCandidates') {
      // Unreachable today, but a batch fill writes every mark in the cell at
      // once and the rule has to hold if it ever comes back.
      for (const digit of cells[move.cell]?.candidates ?? []) {
        notedAt.set(move.cell * 10 + digit, move.at);
      }
    }
  }

  const out: Digit[][] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const cell = cells[i];
    const dead: Digit[] = [];
    if (cell !== undefined && cell.value === null && cell.candidates.size > 0) {
      for (const digit of cell.candidates) {
        const written = notedAt.get(i * 10 + digit);
        if (written === undefined) continue;
        for (const peer of PEERS[i]) {
          if (cells[peer]?.value !== digit) continue;
          const killed = placedAt.get(peer);
          if (killed !== undefined && killed > written) {
            dead.push(digit);
            break;
          }
        }
      }
    }
    out.push(dead.sort((a, b) => a - b));
  }
  return out;
}
