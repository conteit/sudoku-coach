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

  'board.paused': 'Paused',
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

  'offline.ready': 'Ready to play offline.',
  'offline.updateAvailable': 'An update is ready. Reload to use it.',
} as const;
