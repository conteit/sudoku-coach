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
  'action.restart': 'Ricomincia',
  'action.dismiss': 'Non ora',
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
  'games.generatingAttempt': 'Tentativo {attempt} di {max}',
  'games.generationFailed': 'Non sono riuscito a creare la griglia. Riprova.',
  'games.settledFor': 'Nessuna griglia {requested} è uscita in tempo, quindi questa è {actual}.',

  'board.paused': 'In pausa',
  'board.pausedBody': 'La griglia è coperta e il cronometro è fermo.',
  'board.solvedTitle': 'Risolto',
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
  'coach.nudge.contradiction': 'Una delle cifre che hai inserito non può essere giusta.',
  'coach.nudge.staleMarks': 'Una cifra che hai messo lascia annotazioni che non possono più valere.',
  'coach.nudge.stuck': 'Su questa griglia c’è qualcosa che una tecnica riesce ad aprire.',
  'coach.nudge.show': 'Mostrami dove',

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


  'board.label': 'Griglia del sudoku',
  'board.elapsedTime': 'Tempo trascorso {time}',

  'cell.empty': '{cell}, vuota',
  'cell.emptyNotes': '{cell}, vuota, annotazioni {notes}',
  'cell.value': '{cell}, {digit}',
  'cell.valueGiven': '{cell}, {digit}, indizio iniziale',

  'keypad.label': 'Tastierino',
  'keypad.labelNotes': 'Tastierino, modalità annotazioni',
  'keypad.place': 'Inserisci {digit}, ne restano {left}',
  'keypad.note': 'Annota {digit}, ne restano {left}',
  'keypad.notesOn': 'Annotazioni attive',
  'keypad.notesOff': 'Annotazioni disattivate',
  'keypad.erase': 'Svuota la cella',
  'keypad.left': 'ne restano {left}',
  'keypad.done': 'fatto',
  'keypad.captionNotes': 'Note',
  'keypad.captionErase': 'Cancella',
  'keypad.captionUndo': 'Annulla',
  'keypad.captionRedo': 'Ripeti',

  'games.deskEmpty': 'Scrivania sgombra',
  'games.puzzleCountOne': '{count} griglia',
  'games.puzzleCountOther': '{count} griglie',
  'games.newPuzzle': 'Nuova griglia',
  'games.emptyBody': 'Inizia una griglia e ti aspetta qui, esattamente dove l’hai lasciata.',
  'games.resumeLabel': 'Riprendi la griglia {difficulty}, completata al {percent} per cento, {elapsed} di gioco',
  'games.justNow': 'proprio ora',

  'action.keepPlaying': 'Continua a giocare',

  'coach.rung1.name': 'Zona',
  'coach.rung1.gives': 'Dove guardare',
  'coach.rung1.ask': 'Dove devo guardare?',
  'coach.rung2.name': 'Tecnica',
  'coach.rung2.gives': 'Che schema è',
  'coach.rung2.ask': 'Dimmi il nome della tecnica',
  'coach.rung3.name': 'Celle',
  'coach.rung3.gives': 'Esattamente quali celle',
  'coach.rung3.ask': 'Mostrami le celle',
  'coach.rung4.name': 'Dimostrazione',
  'coach.rung4.gives': 'Il ragionamento completo',
  'coach.rung4.ask': 'Spiegamelo passo per passo',
  'coach.ladderAria': 'Livello di rivelazione {level} su 4',
  'coach.ladderReached': 'Livello {level} su 4 — {gives}',
  'coach.ladderNone': 'Non hai ancora chiesto nulla',
  'coach.escalateAria': '{ask} — livello di rivelazione {level} su 4',
  'coach.idlePrompt': 'Bloccato? Chiedi pure: parti dalla spinta più piccola che serve. Sei tu a decidere quanto scendere lungo la scala — la cifra non è mai uno dei gradini.',
  'coach.done': 'Il ragionamento è tutto qui. La cifra tocca a te.',
  'coach.notesHeading': 'Controllo delle annotazioni',
  'coach.marksAllClean': 'Celle controllate: {count}. Le tue annotazioni sono esatte.',
  'coach.marksNeedLook': '{count} celle su {total} controllate meritano una seconda occhiata.',
  'coach.marksUnchanged': 'Non è stato cambiato nulla al posto tuo.',
  'coach.tagInvalid': '{digit} non può stare qui',
  'coach.tagMissing': 'manca {digit}',

  'offline.ready': 'Pronto per giocare offline.',
  'offline.updateAvailable': 'C’è un aggiornamento pronto. Ricarica la pagina per usarlo.',
};
