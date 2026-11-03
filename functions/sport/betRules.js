// Règles d'un coupon Sport : cotes à accepter, fermeture des matchs, fraîcheur des cotes, limites.
// Fonctions pures, sans Firestore : elles sont testées à part.
const LIMITS = {
  minStake: 100,
  maxStake: 200000,
  maxPayout: 5000000,
  minComboLegs: 2,
  maxComboLegs: 10,
  maxOddsAgeMs: 6 * 3600 * 1000, // au-delà, les cotes ne sont plus fiables : les paris sont bloqués
};
const { payoutFor } = require('../games');
const PICKS = ['home', 'draw', 'away', 'over', 'under'];

// Erreur métier : code HttpsError et message affiché au joueur.
function ruleError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

// Vérifie chaque choix du coupon contre l'état actuel des matchs.
// Renvoie les lignes à régler (au prix actuel) et les cotes qui ont changé depuis l'affichage.
// events : Map id -> { status, commenceTimeMs, oddsUpdatedMs, odds, homeTeam, awayTeam }
function priceSelections(selections, events, now) {
  const lines = [];
  const changes = [];
  for (const selection of selections) {
    const event = events.get(selection.eventId);
    if (!event) throw ruleError('not-found', 'Match introuvable.');
    if (event.status !== 'upcoming' || event.commenceTimeMs <= now) {
      throw ruleError('failed-precondition', `Les paris sont fermés pour ${event.homeTeam} – ${event.awayTeam}.`);
    }
    if (!event.odds || !event.oddsUpdatedMs || now - event.oddsUpdatedMs > LIMITS.maxOddsAgeMs) {
      throw ruleError('failed-precondition', 'Cotes indisponibles pour ce match, réessayez plus tard.');
    }
    const current = event.odds[selection.pick];
    if (!PICKS.includes(selection.pick) || typeof current !== 'number' || current <= 1) {
      throw ruleError('invalid-argument', 'Choix de pari invalide.');
    }
    if (selection.price !== current) {
      changes.push({ eventId: selection.eventId, pick: selection.pick, oldPrice: selection.price, newPrice: current });
    }
    lines.push({
      eventId: selection.eventId,
      pick: selection.pick,
      price: current,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      commenceTimeMs: event.commenceTimeMs,
    });
  }
  return { lines, changes };
}

// Contrôle de forme du coupon : mode, mise, nombre de choix, matchs distincts en combiné, gain maximum.
function checkCoupon({ mode, stake, selections }) {
  if (mode !== 'single' && mode !== 'combo') {
    throw ruleError('invalid-argument', 'Type de coupon invalide.');
  }
  if (!Number.isInteger(stake) || stake < LIMITS.minStake || stake > LIMITS.maxStake) {
    throw ruleError('invalid-argument', 'Mise invalide.');
  }
  if (!Array.isArray(selections) || selections.length === 0) {
    throw ruleError('invalid-argument', 'Aucun choix dans le coupon.');
  }
  if (mode === 'combo') {
    if (selections.length < LIMITS.minComboLegs || selections.length > LIMITS.maxComboLegs) {
      throw ruleError('invalid-argument', 'Un combiné compte de 2 à 10 choix.');
    }
    if (new Set(selections.map((selection) => selection.eventId)).size !== selections.length) {
      throw ruleError('invalid-argument', 'Un seul choix par match dans un combiné.');
    }
  }
}

// Gain possible d'un ticket : mise × produit des cotes, arrondi vers le bas.
function potentialPayout(stake, prices) {
  // La cote totale est arrondie à 2 décimales, comme affichée : le gain se calcule sur cette cote.
  const total = Math.round(prices.reduce((product, price) => product * price, 1) * 100) / 100;
  return { totalPrice: total, payout: payoutFor(stake, total) };
}

module.exports = { LIMITS, PICKS, ruleError, priceSelections, checkCoupon, potentialPayout };
