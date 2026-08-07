(() => {
'use strict';

const profiles = {
  vero: {
    name: 'Vero',
    rate: 1.02,
    pitch: 1.16,
    phrase: 'Estoy con vos durante toda la partida. Revisá bien tus cartones y mucha suerte.',
    preview: 'Hola, soy Vero. Desde ahora voy a cantar las bolillas y acompañar cada momento importante de la partida.',
    greeting: 'Hola, soy Vero. Prepará tus cartones porque enseguida comienza el sorteo.',
    ball: [
      'Sale el {n}', 'Vamos con el {n}', 'Atención, número {n}', 'En juego, el {n}', 'La bolilla marca el {n}',
      'Tenemos el {n}', 'El siguiente es el {n}', 'Continuamos con el {n}', 'Ahora sí, el {n}', 'Anoten el {n}',
      'Revisen sus cartones: {n}', 'La suerte trae el {n}', 'Aparece el {n}', 'Va saliendo el {n}', 'Marcamos el {n}',
      'El número es {n}', 'Bolilla {n}', 'Seguimos, número {n}', 'Atentos al {n}', 'El bolillero eligió el {n}',
      'Para todos, el {n}', 'Turno del {n}', 'Vamos avanzando con el {n}', 'La próxima marca es {n}', 'Se suma el {n}',
      'Bien claro: {n}', 'El nuevo número es {n}', 'Tenemos una nueva bolilla: {n}', 'A jugar con el {n}', 'No se pierdan el {n}',
      'Miren bien: {n}', 'En pantalla, el {n}', 'Queda cantado el {n}', 'Vamos a marcar el {n}', 'Número confirmado: {n}',
      'Ojo con este número: {n}', 'Seguimos la ronda con el {n}', 'A revisar todos los cartones: {n}', 'La bolilla que sale es el {n}', 'Vamos por una más: {n}'
    ],
    stages: {
      early: [
        'Esto recién comienza. Revisen cada número con calma.',
        'Primeras bolillas de la partida. Mucha suerte para todos.',
        'Vamos entrando en ritmo. Todavía queda mucho por jugar.',
        'Arrancamos despacio, pero cualquier cartón puede empezar a tomar ventaja.'
      ],
      middle: [
        'Ya estamos en plena partida. Revisen también los otros cartones.',
        'El sorteo avanza y las diferencias empiezan a achicarse.',
        'Seguimos con atención, porque una sola bolilla puede cambiar la carrera.',
        'Ya hay varios números marcados. No pierdan de vista ningún cartón.'
      ],
      late: [
        'Entramos en una parte decisiva del sorteo.',
        'Cada bolilla puede dejar un premio a un solo número.',
        'La carrera está cada vez más apretada. Atención a sus cartones.',
        'Quedan menos números y aumenta la tensión.'
      ],
      final: [
        'Estamos en el tramo final. Máxima atención.',
        'Puede aparecer un ganador en cualquier bolilla.',
        'Último tramo del sorteo. Revisen bien antes de reclamar.',
        'Ya no hay margen para distraerse. Cada número puede definir la partida.'
      ]
    },
    events: {
      startTime: 'Siendo las {time} horas, damos inicio a una nueva partida de La Gorda.',
      ready: '¿Todos preparados? Cartones a la vista, que enseguida empieza el sorteo.',
      luck: '¡Buena suerte para todos! Que empiece la partida.',
      waiting: 'Tus cartones están confirmados. Quedate atento, porque apenas el administrador inicie comenzamos a jugar.',
      pause: 'La partida quedó pausada por un momento. Mantengan sus cartones como están y ya continuamos.',
      resume: 'Volvemos al juego. La partida continúa en',
      remainingBalls: 'Entramos en el cierre. Se van a retirar las últimas bolillas faltantes.',
      claimAmbo: 'Atención. Recibimos un reclamo de Ambo Cabeza. Detenemos el sorteo para verificarlo.',
      claimLine: 'Atención. Tenemos un reclamo de línea. Pausamos el sorteo mientras se verifica el cartón.',
      claimDoubleLine: 'Atención. Reclaman doble línea. Vamos a comprobar el cartón antes de continuar.',
      claimTripleLine: 'Atención. Reclaman triple línea. El sorteo queda detenido mientras verificamos.',
      claimCorners: 'Atención. Tenemos un reclamo de cuatro esquinas. Vamos a verificarlo.',
      claimBingo: '¡Atención! Cantaron bingo. El bolillero queda detenido mientras comprobamos el cartón.',
      amboConfirmed: 'Ambo Cabeza confirmado. Felicitaciones a {name}. Premio válido en el cartón {card}.',
      lineConfirmed: 'Línea confirmada. Felicitaciones a {name}. Premio válido en el cartón {card}.',
      doubleLineConfirmed: 'Doble línea confirmada. Felicitaciones a {name}, con el cartón {card}.',
      tripleLineConfirmed: 'Triple línea confirmada. Felicitaciones a {name}, con el cartón {card}.',
      cornersConfirmed: 'Cuatro esquinas confirmadas. Felicitaciones a {name}, con el cartón {card}.',
      bingoConfirmed: '¡Bingo confirmado! Felicitaciones a {name}. El cartón ganador es el {card}.',
      rejected: 'El reclamo no fue válido. Revisamos el cartón y la partida puede continuar.',
      leaderChange: '{name} pasa al frente de la carrera con el cartón {card}. Está a {missing} para {prize}.',
      leaderOneAway: 'Atención con {name}. El cartón {card} queda a una sola bolilla de {prize}.',
      leaderReady: 'Atención. El cartón {card} de {name} ya completa {prize}. Falta el reclamo y la verificación oficial.',
      gameFinished: 'La partida ha finalizado. Gracias por acompañar a La Gorda y felicitaciones a los ganadores.',
      demoIntro: 'Hola, soy Vero. En esta demo jugás contra {names}. Revisá tus cartones y mucha suerte.',
      demoClaim: 'Atención, {name} reclama {prize}. Pausamos un momento para verificar.',
      demoWinner: '¡{prize} para {name}! Premio confirmado en el cartón {card}. Seguimos atentos a lo que falta.',
      demoNear: 'Atención con {name}. Está a {missing} para {prize}.',
      prizeConfirmedGeneric: '{prize} confirmado. La prueba continúa.',
      bingoConfirmedGeneric: 'Bingo confirmado. La prueba ha encontrado un ganador.'
    }
  }
};

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

class PhraseEngine {
  constructor() { this.bags = new Map(); this.last = new Map(); }
  reset() { this.bags.clear(); this.last.clear(); }
  next(_presenterId, category, values, replacements = {}) {
    const list = Array.isArray(values) ? values.filter(Boolean) : [];
    if (!list.length) return '';
    const key = `vero:${category}`;
    let bag = this.bags.get(key) || [];
    if (!bag.length) {
      bag = shuffle(list);
      const previous = this.last.get(key);
      if (bag.length > 1 && bag[0] === previous) [bag[0], bag[1]] = [bag[1], bag[0]];
    }
    const phrase = bag.shift();
    this.bags.set(key, bag);
    this.last.set(key, phrase);
    return Object.entries(replacements).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), phrase);
  }
  ball(_presenterId, number, drawnCount = 0, total = 90) {
    const profile = profiles.vero;
    const base = this.next('vero', 'ball', profile.ball, { n: number });
    const ratio = total ? drawnCount / total : 0;
    const stage = ratio < .18 ? 'early' : ratio < .55 ? 'middle' : ratio < .82 ? 'late' : 'final';
    // Los comentarios son ocasionales para no tapar el ritmo del bolillero.
    const shouldAdd = drawnCount > 3 && (drawnCount % 10 === 0 || Math.random() < .045);
    if (!shouldAdd) return base;
    const extra = this.next('vero', `stage:${stage}`, profile.stages?.[stage] || []);
    return extra ? `${base}. ${extra}` : base;
  }
  event(_presenterId, name, replacements = {}) {
    const value = profiles.vero.events?.[name] || '';
    return Object.entries(replacements).reduce((text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)), value);
  }
}

window.BingoPresenterScripts = { profiles, PhraseEngine };
})();
