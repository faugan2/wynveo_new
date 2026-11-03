const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const { payoutFor } = require('../games');

// Règlement des paris Sport. Les scores viennent de The Odds API (/scores, avec daysFrom).
// Les fonctions de ce fichier ne lisent pas Firestore, sauf runSportSettlement, en bas.
const API_BASE = 'https://api.the-odds-api.com/v4';
const SCORE_WINDOW_MS = 4 * 3600 * 1000; // matchs démarrés dans les 4 dernières heures
const KEEP_FINISHED_MS = 24 * 3600 * 1000; // matchs terminés dont les paris sont revus pendant 24 h

// Résultat d'un match terminé : scores [{name, score}] en texte. Null si le format n'est pas celui attendu.
// Un format inattendu ne règle rien : le pari reste ouvert et l'erreur est journalisée.
function resultFromScores(apiEvent) {
  if (!apiEvent.completed || !Array.isArray(apiEvent.scores)) return null;
  const home = apiEvent.scores.find((item) => item.name === apiEvent.home_team);
  const away = apiEvent.scores.find((item) => item.name === apiEvent.away_team);
  const isScore = (value) => /^\d+$/.test(String(value));
  if (!home || !away || !isScore(home.score) || !isScore(away.score)) return null;
  return { homeScore: Number(home.score), awayScore: Number(away.score) };
}

// Issue d'un choix : 'won', 'lost' ou 'void' (ligne de plus/moins égale au total : remboursé).
function legOutcome(pick, result, line) {
  const { homeScore, awayScore } = result;
  const total = homeScore + awayScore;
  if ((pick === 'over' || pick === 'under') && total === line) return 'void';
  const won = {
    home: homeScore > awayScore,
    draw: homeScore === awayScore,
    away: awayScore > homeScore,
    over: total > line,
    under: total < line,
  }[pick];
  return won ? 'won' : 'lost';
}

// Règlement d'un ticket. Un choix perdu fait perdre le ticket. Un choix annulé compte à 1 (remboursé).
// Si tous les choix sont annulés, le ticket est remboursé.
function settleTicket(stake, legs) {
  if (legs.some((leg) => leg.outcome === 'lost')) {
    return { status: 'lost', payout: 0, multiplier: 0 };
  }
  const product = Math.round(legs.reduce((total, leg) => total * (leg.outcome === 'void' ? 1 : leg.price), 1) * 100) / 100;
  const allVoid = legs.every((leg) => leg.outcome === 'void');
  return {
    status: allVoid ? 'void' : 'won',
    payout: payoutFor(stake, product),
    multiplier: product,
  };
}

// Part du gain versée sur le solde réel : même proportion que la mise (dépôts d'abord, puis bonus).
function splitPayout(payout, stake, realUsed) {
  const payoutReal = stake > 0 ? Math.floor((payout * realUsed) / stake) : 0;
  return { payoutReal, payoutBonus: payout - payoutReal };
}

// Fetch des scores d'une compétition : les matchs terminés des 24 dernières heures et les matchs en cours.
async function fetchScores(sportKey, apiKey) {
  const query = new URLSearchParams({ apiKey, daysFrom: '1', dateFormat: 'iso' });
  const response = await fetch(`${API_BASE}/sports/${sportKey}/scores/?${query}`);
  if (!response.ok) {
    throw new Error(`The Odds API : HTTP ${response.status} pour les scores de ${sportKey}`);
  }
  return response.json();
}

// Marque les matchs terminés, puis règle les paris qui les concernent.
// Idempotent : un match déjà terminé et un pari déjà réglé ne sont pas modifiés une seconde fois.
async function runSportSettlement(db, apiKey, now = Date.now()) {
  const started = await db
    .collection('wy_sport_events')
    .where('commenceTime', '>=', Timestamp.fromMillis(now - SCORE_WINDOW_MS))
    .where('commenceTime', '<=', Timestamp.fromMillis(now))
    .get();
  const pending = started.docs.filter((doc) => !['finished', 'cancelled'].includes(doc.get('status')));
  const report = { finished: [], unexpectedFormat: [], settledBets: 0, errors: [] };

  const sportKeys = [...new Set(pending.map((doc) => doc.get('sportKey')))];
  for (const sportKey of sportKeys) {
    try {
      const apiEvents = await fetchScores(sportKey, apiKey);
      for (const apiEvent of apiEvents) {
        if (!apiEvent.completed) continue;
        const ref = db.collection('wy_sport_events').doc(apiEvent.id);
        const doc = pending.find((item) => item.id === apiEvent.id);
        if (!doc) continue;
        const result = resultFromScores(apiEvent);
        if (!result) {
          report.unexpectedFormat.push(apiEvent.id);
          console.error('Scores au format inattendu', apiEvent.id, JSON.stringify(apiEvent.scores));
          continue;
        }
        const line = doc.get('odds')?.line ?? 2.5;
        await ref.set(
          { status: 'finished', result: { ...result, totalLine: line }, finishedAt: Timestamp.fromMillis(now) },
          { merge: true }
        );
        report.finished.push(apiEvent.id);
      }
    } catch (error) {
      console.error('Relevé des scores en échec', sportKey, error.message);
      report.errors.push({ sportKey, message: error.message });
    }
  }

  // Revoit les paris des matchs terminés récemment : un pari à plusieurs choix attend la fin de tous ses matchs.
  const recent = await db
    .collection('wy_sport_events')
    .where('finishedAt', '>=', Timestamp.fromMillis(now - KEEP_FINISHED_MS))
    .get();
  for (const doc of recent.docs) {
    if (doc.get('status') !== 'finished') continue;
    report.settledBets += await settleEventBets(db, doc.id);
  }
  return report;
}

// Règle les paris ouverts qui contiennent ce match, dès que tous leurs matchs sont terminés.
async function settleEventBets(db, eventId) {
  const betsSnapshot = await db.collection('wy_bets').where('eventIds', 'array-contains', eventId).get();
  let settled = 0;
  for (const betDoc of betsSnapshot.docs) {
    if (betDoc.get('status') !== 'open') continue;
    const bet = betDoc.data();
    const eventRefs = [...new Set(bet.selections.map((selection) => selection.eventId))].map((id) =>
      db.collection('wy_sport_events').doc(id)
    );
    const eventSnapshots = await db.getAll(...eventRefs);
    const allFinished = eventSnapshots.every((snapshot) => ['finished', 'cancelled'].includes(snapshot.get('status')));
    if (!allFinished) continue;

    const legs = bet.selections.map((selection) => {
      const snapshot = eventSnapshots.find((item) => item.id === selection.eventId);
      if (snapshot.get('status') === 'cancelled') return { ...selection, outcome: 'void' };
      const { result } = snapshot.data();
      return { ...selection, outcome: legOutcome(selection.pick, result, result.totalLine) };
    });
    const outcome = settleTicket(bet.stake, legs);
    if (await settleBet(db, betDoc.ref, bet, outcome)) settled += 1;
  }
  return settled;
}

// Écrit le règlement d'un pari dans une transaction, si le pari est toujours ouvert.
async function settleBet(db, betRef, bet, outcome) {
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(betRef);
    if (!snapshot.exists || snapshot.get('status') !== 'open') return false;
    const userRef = db.collection('wy_users').doc(bet.uid);
    if (outcome.payout > 0) {
      const { payoutReal, payoutBonus } = splitPayout(outcome.payout, bet.stake, bet.realUsed);
      tx.update(userRef, {
        'balance.real': FieldValue.increment(payoutReal),
        'balance.bonus': FieldValue.increment(payoutBonus),
      });
    }
    tx.update(betRef, {
      status: outcome.status,
      payout: outcome.payout,
      multiplier: outcome.multiplier,
      settledAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

module.exports = {
  resultFromScores,
  legOutcome,
  settleTicket,
  splitPayout,
  runSportSettlement,
  settleEventBets,
};
