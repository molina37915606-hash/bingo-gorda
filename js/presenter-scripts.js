(() => {
'use strict';

const profiles = {
  vero: {
    name: 'Vero', rate: 1.04, pitch: 1.22,
    phrase: 'Revisá bien tus cartones y mucha suerte.',
    preview: 'Hola, soy Vero. Voy a acompañarte durante todo el sorteo.',
    greeting: 'Hola, soy Vero y enseguida arranca el sorteo. ¿Necesitás una guía?',
    ball: [
      'Sale el {n}', 'Vamos con el {n}', 'Atención, número {n}', 'En juego, el {n}', 'La bolilla marca el {n}',
      'Tenemos el {n}', 'El siguiente es el {n}', 'Continuamos con el {n}', 'Ahora sí, el {n}', 'Anoten el {n}',
      'Revisen sus cartones: {n}', 'La suerte trae el {n}', 'Aparece el {n}', 'Va saliendo el {n}', 'Marcamos el {n}',
      'El número es {n}', 'Bolilla {n}', 'Seguimos, número {n}', 'Atentos al {n}', 'El bolillero eligió el {n}',
      'Para todos, el {n}', 'Turno del {n}', 'Vamos avanzando con el {n}', 'La próxima marca es {n}', 'Se suma el {n}',
      'Bien claro: {n}', 'El nuevo número es {n}', 'Tenemos una nueva bolilla: {n}', 'A jugar con el {n}', 'No se pierdan el {n}',
      'Miren bien: {n}', 'En pantalla, el {n}', 'Queda cantado el {n}', 'Vamos a marcar el {n}', 'Número confirmado: {n}'
    ],
    stages: {
      early: ['Esto recién comienza. Revisá cada número con calma.', 'Primeras bolillas de la noche. Mucha suerte.', 'Vamos entrando en ritmo.'],
      middle: ['Ya estamos en plena partida. Revisen bien sus cartones.', 'El sorteo avanza y puede aparecer una jugada.', 'Seguimos con atención, que la suerte puede cambiar en una bolilla.'],
      late: ['Entramos en una parte decisiva del sorteo.', 'Cada bolilla puede definir un premio.', 'Quedan menos números. No pierdan de vista sus cartones.'],
      final: ['Estamos en las últimas bolillas disponibles.', 'Máxima atención: el final puede llegar en cualquier momento.', 'Último tramo del sorteo.']
    },
    events: {
      startTime: 'Siendo las {time} horas, damos inicio a un nuevo sorteo.',
      ready: '¿Todos preparados? Enseguida inicia el sorteo.',
      luck: '¡Buena suerte para todos!',
      pause: 'El administrador pausó la partida. Ya continuamos.',
      resume: 'La partida continúa en',
      claimAmbo: 'Atención, recibimos un reclamo de AmboCabeza. Vamos a verificarlo.',
      claimLine: 'Atención, tenemos un reclamo de línea. Detenemos el sorteo para verificar.',
      claimBingo: 'Atención, cantaron bingo. El bolillero queda detenido mientras verificamos.',
      amboConfirmed: 'AmboCabeza confirmado. Felicitaciones.',
      lineConfirmed: 'Línea confirmada. Felicitaciones al ganador.',
      bingoConfirmed: 'Bingo confirmado. Tenemos ganador.',
      remainingBalls: 'Se retiran las últimas bolas faltantes.',
      rejected: 'El reclamo no fue válido. La partida podrá continuar.',
      waiting: 'Tus cartones están confirmados. Ahora esperamos el inicio del sorteo.'
    }
  },
  vivi: {
    name: 'Vivi', rate: 1.07, pitch: 1.25,
    phrase: 'Vamos a divertirnos en esta partida.',
    preview: 'Hola, soy Vivi. Prepará tus cartones porque se viene una gran partida.',
    greeting: 'Hola, soy Vivi y enseguida arranca el sorteo. ¿Necesitás una guía?',
    ball: [
      '¡Vamos! Sale el {n}', 'Ahora aparece el {n}', 'A marcar el {n}', 'La suerte eligió el {n}', 'Tenemos el {n}',
      'Se viene el {n}', 'Atentos, número {n}', 'El bolillero nos da el {n}', 'Vamos con otro: {n}', 'Miren bien, el {n}',
      'Apareció el {n}', 'Seguimos jugando con el {n}', 'El protagonista ahora es el {n}', 'Anoten rápido el {n}', 'Que no se escape el {n}',
      'Nuevo número: {n}', 'Para los cartones, el {n}', 'Ahí va el {n}', 'Sumamos el {n}', 'La próxima marca es el {n}',
      'Vamos avanzando: {n}', 'Sale clarito el {n}', 'A revisar, número {n}', 'El turno es del {n}', 'La bolilla trae el {n}',
      'Tenemos una nueva oportunidad con el {n}', 'Atención a sus pantallas: {n}', 'Queda cantado el {n}', 'Vamos por el {n}', 'Número de la suerte: {n}',
      'A ver quién lo tiene: {n}', 'El juego sigue con el {n}', 'No parpadeen: {n}', 'Marcamos juntos el {n}', 'El siguiente es {n}'
    ],
    stages: {
      early: ['Recién empezamos y ya se siente la emoción.', 'Cartones listos, que esto acaba de comenzar.', 'Vamos calentando el bolillero.'],
      middle: ['La partida está cada vez más interesante.', 'Ya hay varios números marcados. Revisen todo.', 'Seguimos con buen ritmo y mucha atención.'],
      late: ['Entramos en terreno de premios.', 'Ahora cada número puede cambiarlo todo.', 'No se despeguen de sus cartones.'],
      final: ['Último tramo. Puede haber ganador en cualquier momento.', 'Estamos muy cerca de una definición.', 'Atención máxima en estas últimas bolillas.']
    },
    events: {
      startTime: 'Siendo las {time} horas, empezamos un nuevo sorteo.',
      ready: '¿Todos preparados? Enseguida comienza el sorteo.',
      luck: '¡Mucha suerte y a disfrutar!',
      pause: 'El administrador pausó la partida. Ya continuamos.',
      resume: 'Volvemos al juego en',
      claimAmbo: '¡Atención! Cantaron AmboCabeza. Vamos a revisarlo.',
      claimLine: '¡Tenemos un reclamo de línea! Pausamos para verificar.',
      claimBingo: '¡Cantaron bingo! Detenemos todo para comprobarlo.',
      amboConfirmed: '¡AmboCabeza confirmado! Felicitaciones.',
      lineConfirmed: '¡La línea es correcta! Felicitaciones.',
      bingoConfirmed: '¡Bingo confirmado! Felicitaciones al ganador.',
      remainingBalls: 'Se retiran las últimas bolas faltantes.',
      rejected: 'El reclamo no fue válido. Enseguida seguimos jugando.',
      waiting: 'Tus cartones ya están listos. Esperamos juntos el inicio.'
    }
  },
  josu: {
    name: 'Josu', rate: .98, pitch: .88,
    phrase: '¿Listos para jugar?',
    preview: 'Buenas, soy Josu. Voy a cantar los números con claridad durante la partida.',
    greeting: 'Hola, soy Josu y enseguida arranca el sorteo. ¿Necesitás una guía?',
    ball: [
      'En juego, el número {n}', 'Continuamos con el {n}', 'Sale el {n}', 'Número {n}', 'La bolilla es el {n}',
      'Siguiente número: {n}', 'Se incorpora el {n}', 'Queda anunciado el {n}', 'Ahora, el {n}', 'Atención al {n}',
      'Marcamos el {n}', 'El resultado es {n}', 'Bolilla número {n}', 'Seguimos con {n}', 'En pantalla, {n}',
      'Nuevo número, {n}', 'El turno corresponde al {n}', 'Se suma el {n}', 'La extracción da {n}', 'Tenemos el número {n}',
      'Revisen el {n}', 'Anunciamos el {n}', 'El bolillero indica {n}', 'Próxima bolilla: {n}', 'Queda registrado el {n}',
      'Vamos con el {n}', 'Número confirmado, {n}', 'Se canta el {n}', 'El siguiente valor es {n}', 'Para marcar: {n}',
      'Atención, {n}', 'Continuamos la secuencia con {n}', 'La nueva bolilla es {n}', 'Resultado de la extracción: {n}', 'En juego queda el {n}'
    ],
    stages: {
      early: ['La partida acaba de comenzar. Mantengan sus cartones a la vista.', 'Primer tramo del sorteo.', 'Continuamos con orden y atención.'],
      middle: ['Estamos en la mitad del sorteo.', 'Revisen las marcas realizadas hasta ahora.', 'La partida continúa sin interrupciones.'],
      late: ['Ingresamos en el tramo decisivo.', 'Quedan menos números disponibles.', 'Cada nueva bolilla puede completar una jugada.'],
      final: ['Últimas bolillas. Atención a posibles premios.', 'Nos acercamos al cierre del sorteo.', 'Mantengan la atención hasta la confirmación final.']
    },
    events: {
      startTime: 'Siendo las {time} horas, damos inicio a un nuevo sorteo.',
      ready: 'Todos preparados. El sorteo comenzará en unos instantes.',
      luck: 'Buena suerte para todos.',
      pause: 'El administrador pausó la partida. Continuaremos en breve.',
      resume: 'La partida continúa en',
      claimAmbo: 'Se recibió un reclamo de AmboCabeza. Procedemos a verificarlo.',
      claimLine: 'Se recibió un reclamo de línea. Procedemos a verificarlo.',
      claimBingo: 'Se recibió un reclamo de bingo. El bolillero queda detenido.',
      amboConfirmed: 'AmboCabeza confirmado. Felicitaciones.',
      lineConfirmed: 'Línea confirmada. Felicitaciones.',
      bingoConfirmed: 'Bingo confirmado. Tenemos ganador.',
      remainingBalls: 'Se retiran las últimas bolas faltantes.',
      rejected: 'El reclamo fue rechazado. La partida podrá continuar.',
      waiting: 'Los cartones quedaron confirmados. Esperamos el inicio oficial.'
    }
  },
  daia: {
    name: 'Daia', rate: 1.03, pitch: 1.18,
    phrase: 'Mucha suerte para todos.',
    preview: 'Hola, soy Daia. Voy a acompañarte para que no te pierdas ningún número.',
    greeting: 'Hola, soy Daia y enseguida arranca el sorteo. ¿Necesitás una guía?',
    ball: [
      'Revisá tu cartón: {n}', 'Vamos con el {n}', 'Sale el número {n}', 'Ahora aparece el {n}', 'Atención al {n}',
      'Tenemos el {n}', 'El siguiente es el {n}', 'Marcamos el {n}', 'Mirá bien, número {n}', 'La bolilla trae el {n}',
      'Continuamos con {n}', 'Nuevo número: {n}', 'A revisar el {n}', 'En pantalla está el {n}', 'No te pierdas el {n}',
      'Se suma el {n}', 'Vamos despacio: {n}', 'El turno es del {n}', 'La suerte marca el {n}', 'Anotá el {n}',
      'Seguimos juntos con el {n}', 'El bolillero eligió el {n}', 'Tenemos una nueva bolilla: {n}', 'Ahora toca el {n}', 'Queda cantado el {n}',
      'Para todos, el {n}', 'Vamos a marcar el {n}', 'El nuevo número es {n}', 'Atención, sale {n}', 'Revisen bien el {n}',
      'Número confirmado: {n}', 'Aparece una nueva oportunidad: {n}', 'Seguimos con el número {n}', 'Miren sus cartones: {n}', 'La próxima marca es {n}'
    ],
    stages: {
      early: ['Esto recién comienza. Tomate tu tiempo para marcar.', 'Primeras bolillas. Mucha suerte.', 'Ya estamos jugando. Revisá todo con calma.'],
      middle: ['La partida avanza. Mirá también tus otros cartones.', 'Estamos en plena partida.', 'Seguimos atentos a cada bolilla.'],
      late: ['Entramos en un momento importante.', 'Puede aparecer una jugada en cualquier momento.', 'Quedan menos números y aumenta la emoción.'],
      final: ['Último tramo. No te distraigas.', 'Estamos muy cerca del final.', 'Atención especial a estas últimas bolillas.']
    },
    events: {
      startTime: 'Siendo las {time} horas, damos inicio a un nuevo sorteo.',
      ready: '¿Todos preparados? Enseguida inicia el sorteo.',
      luck: '¡Buena suerte para todos!',
      pause: 'El administrador pausó la partida. Ya continuamos.',
      resume: 'La partida continúa en',
      claimAmbo: 'Tenemos un posible AmboCabeza. Vamos a revisarlo.',
      claimLine: 'Tenemos una posible línea. Pausamos para verificar.',
      claimBingo: 'Cantaron bingo. Detenemos el sorteo para comprobarlo.',
      amboConfirmed: 'AmboCabeza confirmado. Felicitaciones.',
      lineConfirmed: 'Línea confirmada. Felicitaciones al ganador.',
      bingoConfirmed: 'Bingo confirmado. Felicitaciones.',
      remainingBalls: 'Se retiran las últimas bolas faltantes.',
      rejected: 'El reclamo no fue válido. Enseguida retomamos la partida.',
      waiting: 'Tus cartones están confirmados. Ahora esperamos el sorteo.'
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
  next(presenterId, category, values, replacements = {}) {
    const list = Array.isArray(values) ? values.filter(Boolean) : [];
    if (!list.length) return '';
    const key = `${presenterId}:${category}`;
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
  ball(presenterId, number, drawnCount = 0, total = 90) {
    const profile = profiles[presenterId] || profiles.vero;
    const base = this.next(presenterId, 'ball', profile.ball, { n: number });
    const ratio = total ? drawnCount / total : 0;
    const stage = ratio < .18 ? 'early' : ratio < .55 ? 'middle' : ratio < .82 ? 'late' : 'final';
    const shouldAdd = drawnCount > 2 && (drawnCount % 9 === 0 || Math.random() < .07);
    if (!shouldAdd) return base;
    const extra = this.next(presenterId, `stage:${stage}`, profile.stages?.[stage] || []);
    return extra ? `${base}. ${extra}` : base;
  }
  event(presenterId, name, replacements = {}) {
    const profile = profiles[presenterId] || profiles.vero;
    const value = profile.events?.[name] || '';
    return Object.entries(replacements).reduce((text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)), value);
  }
}

window.BingoPresenterScripts = { profiles, PhraseEngine };
})();
