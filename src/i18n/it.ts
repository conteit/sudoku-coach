/**
 * Italian UI dictionary. Written as Italian, not translated from English:
 * where the two languages want a different sentence, the Italian one wins.
 *
 * Vocabulary held constant across the app and the lesson library:
 *   cell -> cella · row -> riga · column -> colonna · box -> riquadro
 *   candidate -> candidato · pencil mark -> annotazione · peer -> "cella che
 *   vede questa" (the standard Italian phrasing for the seeing relation).
 *
 * Apostrophes are typographic (U+2019), as Italian typography expects.
 */
import type { Dictionary } from './types';

export const it: Dictionary = {
  'app.name': 'Sudoku Coach',
  'app.tagline': 'Un sudoku che ti insegna a risolverlo.',

  'nav.play': 'Gioca',
  'nav.games': 'Partite',
  'nav.progress': 'Progressi',
  'nav.settings': 'Impostazioni',

  'action.newGame': 'Nuova partita',
  'action.continue': 'Continua',
  'action.undo': 'Annulla mossa',
  'action.redo': 'Ripeti mossa',
  'action.erase': 'Cancella',
  'action.notes': 'Annotazioni',
  'action.hint': 'Suggerimento',
  'action.checkMarks': 'Controlla le annotazioni',
  'action.pause': 'Pausa',
  'action.resume': 'Riprendi',
  'action.delete': 'Elimina',
  'action.cancel': 'Annulla',
  'action.confirm': 'Conferma',
  'action.close': 'Chiudi',
  'action.back': 'Indietro',

  'difficulty.easy': 'Facile',
  'difficulty.medium': 'Medio',
  'difficulty.hard': 'Difficile',
  'difficulty.expert': 'Esperto',

  'games.title': 'Le tue partite',
  'games.empty': 'Ancora nessuna partita. Iniziane una e la ritrovi qui.',
  'games.inProgress': 'In corso',
  'games.completed': 'Completate',
  'games.startedOn': 'Iniziata il {date}',
  'games.elapsed': 'Tempo {time}',
  'games.filled': '{filled} celle su {total} compilate',
  'games.newGamePrompt': 'Scegli la difficoltà.',
  'games.generating': 'Sto preparando una griglia',

  'board.paused': 'In pausa',
  'board.solved': 'Risolto in {time}',
  'board.conflict': 'Questa cifra compare già nella riga, nella colonna o nel riquadro.',
  'board.givenLocked': 'Questa cella fa parte degli indizi iniziali.',

  'coach.title': 'Coach',
  'coach.idle': 'Chiedi pure quando vuoi una spinta. Finché non lo chiedi, non ti viene svelato nulla.',
  'coach.reading': 'Sto leggendo la griglia',
  'coach.nothingFound':
    'Su questa griglia non c’è ancora nulla che ceda a una tecnica. Riempi quello che puoi e torna qui.',
  'coach.stepLabel': 'Passo {level} di {total}',
  'coach.escalate': 'Dimmi di più',
  'coach.enough': 'Mi basta così',
  'coach.technique': 'Tecnica',
  'coach.whatIsThis': 'Che tecnica è questa?',
  'coach.marksClean': 'Tutte le annotazioni che hai messo sono corrette.',
  'coach.marksSummary': 'Ci sono {count} annotazioni da rivedere.',
  'coach.markMissing': 'Qui {digit} è ancora possibile e non lo hai annotato.',
  'coach.markInvalid': 'Qui hai annotato {digit}, ma una cella che vede questa lo contiene già.',
  'coach.marksChecked': '{count} celle controllate',

  'house.row': 'riga {index}',
  'house.col': 'colonna {index}',
  'house.box': 'riquadro {index}',

  'confirm.deleteGame.title': 'Eliminare questa partita?',
  'confirm.deleteGame.body': 'Se ne vanno la griglia e tutta la sua cronologia. Non si torna indietro.',
  'confirm.restart.title': 'Ricominciare questa griglia?',
  'confirm.restart.body': 'La griglia torna agli indizi iniziali e il cronometro riparte da zero.',

  'settings.title': 'Impostazioni',
  'settings.language': 'Lingua',
  'settings.theme': 'Tema',
  'settings.theme.system': 'Come il dispositivo',
  'settings.theme.light': 'Chiaro',
  'settings.theme.dark': 'Scuro',
  'settings.haptics': 'Vibrazione',
  'settings.highlightConflicts': 'Segnala le cifre in conflitto',

  'mastery.title': 'Tecniche',
  'mastery.unseen': 'Non ancora incontrata',
  'mastery.taught': 'Spiegata',
  'mastery.recognized_with_hint': 'Riconosciuta con un aiuto',
  'mastery.applied_unaided': 'Usata senza aiuto',

  'offline.ready': 'Pronto per giocare offline.',
  'offline.updateAvailable': 'C’è un aggiornamento pronto. Ricarica la pagina per usarlo.',
};
