/**
 * English UI dictionary. This file is the reference locale: `MessageKey` and
 * the per-key placeholder types are derived from it, so every other locale is
 * checked against it at compile time.
 *
 * Keys are flat and dotted. Placeholders are `{name}` and are substituted by
 * `t()`; a key's placeholder set is part of its contract and must match across
 * locales (enforced in i18n.test.ts).
 *
 * Lesson and hint copy does NOT live here — it is authored per technique in
 * src/coach/lessons/{locale}.json. This file is chrome only, plus the house
 * labels that fill the `{house}` token of a hint.
 */
export const en = {
  'app.name': 'Sudoku Coach',
  'app.tagline': 'A sudoku that teaches you to solve it.',

  'nav.play': 'Play',
  'nav.games': 'Games',
  'nav.progress': 'Progress',
  'nav.settings': 'Settings',

  'action.newGame': 'New game',
  'action.continue': 'Continue',
  'action.undo': 'Undo',
  'action.redo': 'Redo',
  'action.erase': 'Erase',
  'action.notes': 'Notes',
  'action.hint': 'Hint',
  'action.checkMarks': 'Check my notes',
  'action.pause': 'Pause',
  'action.resume': 'Resume',
  'action.delete': 'Delete',
  'action.cancel': 'Cancel',
  'action.confirm': 'Confirm',
  'action.close': 'Close',
  'action.restart': 'Start over',
  'action.dismiss': 'Not now',
  'action.back': 'Back',

  'difficulty.easy': 'Easy',
  'difficulty.medium': 'Medium',
  'difficulty.hard': 'Hard',
  'difficulty.expert': 'Expert',

  'games.title': 'Your games',
  'games.empty': 'No games yet. Start one and it will be waiting here.',
  'games.inProgress': 'In progress',
  'games.completed': 'Finished',
  'games.startedOn': 'Started {date}',
  'games.elapsed': 'Time {time}',
  'games.filled': '{filled} of {total} cells filled',
  'games.newGamePrompt': 'Pick a difficulty.',
  'games.generating': 'Building a puzzle',
  'games.generatingAttempt': 'Attempt {attempt} of {max}',
  'games.generationFailed': 'That puzzle could not be built. Try again.',
  'games.settledFor': 'No {requested} puzzle came out in time, so this one is {actual}.',

  'board.paused': 'Paused',
  'board.pausedBody': 'The grid is covered and the clock has stopped.',
  'board.solvedTitle': 'Solved',
  'board.solved': 'Solved in {time}',
  'board.conflict': 'That digit already appears in this row, column or box.',
  'board.givenLocked': 'That cell was given with the puzzle.',

  'coach.title': 'Coach',
  'coach.idle': 'Ask when you want a nudge. Nothing is revealed until you ask.',
  'coach.reading': 'Reading the board',
  'coach.nothingFound': 'Nothing on this board yields to a technique yet. Fill in what you can and come back.',
  'coach.stepLabel': 'Step {level} of {total}',
  'coach.escalate': 'Tell me more',
  'coach.enough': 'That is enough',
  'coach.technique': 'Technique',
  'coach.whatIsThis': 'What is this technique?',
  'coach.marksClean': 'Every note you have made is right.',
  'coach.marksSummary': '{count} notes need attention.',
  'coach.markMissing': '{digit} is still possible here and you have not noted it.',
  'coach.markInvalid': '{digit} is noted here, but a cell that sees this one already holds it.',
  'coach.marksChecked': '{count} cells checked',
  'coach.nudge.contradiction': 'One of the digits you have entered cannot be right.',
  'coach.nudge.staleMarks': 'A digit you placed leaves notes behind that can no longer hold.',
  'coach.nudge.stuck': 'There is something on this board that a technique cracks.',
  'coach.nudge.show': 'Show me where',

  'house.row': 'row {index}',
  'house.col': 'column {index}',
  'house.box': 'box {index}',

  'confirm.deleteGame.title': 'Delete this game?',
  'confirm.deleteGame.body': 'The board and its history go with it. This cannot be undone.',
  'confirm.restart.title': 'Start this puzzle over?',
  'confirm.restart.body': 'The grid returns to its givens and the timer resets.',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.theme.system': 'Match device',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.haptics': 'Haptic feedback',
  'settings.highlightConflicts': 'Flag conflicting digits',

  'mastery.title': 'Techniques',
  'mastery.unseen': 'Not met yet',
  'mastery.taught': 'Taught',
  'mastery.recognized_with_hint': 'Used with a hint',
  'mastery.applied_unaided': 'Used unaided',


  'board.label': 'Sudoku board',
  'board.elapsedTime': 'Elapsed time {time}',

  'cell.empty': '{cell}, empty',
  'cell.emptyNotes': '{cell}, empty, notes {notes}',
  'cell.value': '{cell}, {digit}',
  'cell.valueGiven': '{cell}, {digit}, given',

  'keypad.label': 'Keypad',
  'keypad.labelNotes': 'Keypad, notes mode',
  'keypad.place': 'Place {digit}, {left} left',
  'keypad.note': 'Note {digit}, {left} left',
  'keypad.notesOn': 'Notes on',
  'keypad.notesOff': 'Notes off',
  'keypad.erase': 'Erase cell',

  'games.deskEmpty': 'Nothing on the desk',
  'games.puzzleCountOne': '{count} puzzle',
  'games.puzzleCountOther': '{count} puzzles',
  'games.newPuzzle': 'New puzzle',
  'games.emptyBody': 'Start a puzzle and it waits here, exactly where you left it.',
  'games.resumeLabel': 'Resume {difficulty} puzzle, {percent} percent complete, {elapsed} played',
  'games.justNow': 'just now',

  'action.keepPlaying': 'Keep playing',

  'coach.rung1.name': 'Region',
  'coach.rung1.gives': 'Where to look',
  'coach.rung1.ask': 'Where should I look?',
  'coach.rung2.name': 'Technique',
  'coach.rung2.gives': 'What pattern it is',
  'coach.rung2.ask': 'Name the technique',
  'coach.rung3.name': 'Cells',
  'coach.rung3.gives': 'Exactly which cells',
  'coach.rung3.ask': 'Show me the cells',
  'coach.rung4.name': 'Proof',
  'coach.rung4.gives': 'The full argument',
  'coach.rung4.ask': 'Walk me through it',
  'coach.ladderAria': 'Disclosure level {level} of 4',
  'coach.ladderReached': 'Level {level} of 4 — {gives}',
  'coach.ladderNone': 'Nothing taken yet',
  'coach.escalateAria': '{ask} — disclosure level {level} of 4',
  'coach.idlePrompt': 'Stuck? Ask, and you get the smallest useful nudge first. You decide how far down the ladder to go — the digit is never one of the rungs.',
  'coach.done': 'That is the whole argument. The digit is yours to place.',
  'coach.notesHeading': 'Note check',
  'coach.marksAllClean': 'All {count} cells checked — your notes are exactly right.',
  'coach.marksNeedLook': '{count} of {total} checked cells need a second look.',
  'coach.marksUnchanged': 'Nothing has been changed for you.',
  'coach.tagInvalid': "{digit} can't be here",
  'coach.tagMissing': '{digit} is missing',

  'offline.ready': 'Ready to play offline.',
  'offline.updateAvailable': 'An update is ready. Reload to use it.',
} as const;
