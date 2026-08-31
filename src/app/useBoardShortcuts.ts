/**
 * Whole-screen keyboard shortcuts for the board.
 *
 * The grid already owns the keys that are about a cell — arrows, digits,
 * backspace — because they only mean anything while it has focus. These four
 * are about the game rather than the cell, and a player who has just clicked
 * the coach's button should still be able to undo without reaching for the
 * mouse again.
 *
 * Nothing fires while a dialog is open or while something is being typed into:
 * a sheet is a question, and answering it with "u" should not rewind the board
 * behind it.
 */

import { useEffect } from 'react';

export interface BoardShortcuts {
  onToggleNotes: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onHint: () => void;
  /** Held off while a sheet or dialog owns the screen. */
  enabled: boolean;
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT');

export function useBoardShortcuts({
  onToggleNotes,
  onUndo,
  onRedo,
  onHint,
  enabled,
}: BoardShortcuts): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTyping(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      // The platform undo/redo shortcuts, which players try first.
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        onRedo();
        return;
      }
      if (mod || event.altKey) return;

      switch (key) {
        case 'n':
          event.preventDefault();
          onToggleNotes();
          return;
        case 'u':
          event.preventDefault();
          onUndo();
          return;
        case 'r':
          event.preventDefault();
          onRedo();
          return;
        case 'h':
          event.preventDefault();
          onHint();
          return;
        default:
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onHint, onRedo, onToggleNotes, onUndo]);
}
