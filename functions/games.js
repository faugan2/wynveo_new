const crypto = require('crypto');

// Valeurs par défaut des jeux. Chaque jeu peut être réglé depuis l'admin (document wy_settings/{jeu}) :
// les clés sont listées dans projet.md, section « Paramètres à configurer dans l'admin ».

// Lucky Spin : 8 cases dans l'ordre de la roue (sens horaire, à partir du haut).
// Chaque case a un poids. RTP = somme(poids × multiplicateur) / somme des poids = 89,9 %.
const LUCKY_SPIN = {
  minStake: 100,
  maxStake: 10000,
  segments: [
    { multiplier: 2, weight: 300 },
    { multiplier: 5, weight: 50 },
    { multiplier: 10, weight: 20 },
    { multiplier: 50, weight: 10 },
    { multiplier: 1, weight: 3980 },
    { multiplier: 0.5, weight: 5320 },
    { multiplier: 10, weight: 20 },
    { multiplier: 2, weight: 300 },
  ],
};

// Tire une case au hasard, selon les poids (crypto.randomInt : tirage sûr côté serveur).
function pickLuckySpinSegment(segments = LUCKY_SPIN.segments) {
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0);
  const draw = crypto.randomInt(total);
  let cumulative = 0;
  for (let index = 0; index < segments.length; index += 1) {
    cumulative += segments[index].weight;
    if (draw < cumulative) return index;
  }
  return segments.length - 1;
}

// Retour théorique au joueur, pour vérifier la configuration.
function luckySpinRtp(segments = LUCKY_SPIN.segments) {
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0);
  const sum = segments.reduce((acc, { multiplier, weight }) => acc + multiplier * weight, 0);
  return sum / total;
}

// Mystery Box : 9 coffres tirés avant l'ouverture. Le gain est le coffre choisi (mise × multiplicateur).
// Probabilités sur 1 000 : RTP = (350×0,5 + 155×1 + 120×2 + 40×3 + 20×10) / 1000 = 89 %.
const MYSTERY_BOX = {
  minStake: 100,
  maxStake: 10000,
  boxCount: 9,
  outcomes: [
    { multiplier: 0, weight: 315 },
    { multiplier: 0.5, weight: 350 },
    { multiplier: 1, weight: 155 },
    { multiplier: 2, weight: 120 },
    { multiplier: 3, weight: 40 },
    { multiplier: 10, weight: 20 },
  ],
};

// Tire le multiplicateur d'un coffre.
function pickMysteryBoxMultiplier(outcomes = MYSTERY_BOX.outcomes) {
  const total = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
  const draw = crypto.randomInt(total);
  let cumulative = 0;
  for (const outcome of outcomes) {
    cumulative += outcome.weight;
    if (draw < cumulative) return outcome.multiplier;
  }
  return 0;
}

// Tire les 9 coffres.
function drawMysteryBoxes(outcomes = MYSTERY_BOX.outcomes, boxCount = MYSTERY_BOX.boxCount) {
  return Array.from({ length: boxCount }, () => pickMysteryBoxMultiplier(outcomes));
}

function mysteryBoxRtp(outcomes = MYSTERY_BOX.outcomes) {
  const total = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
  const sum = outcomes.reduce((acc, { multiplier, weight }) => acc + multiplier * weight, 0);
  return sum / total;
}

// Lucky Number : 5 numéros choisis sur 50. Tirage toutes les 15 minutes.
// Gains selon le nombre de bons numéros : 2 → 2x, 3 → 10x, 4 → 100x, 5 → 1 000 000 FCFA (fixe).
const LUCKY_NUMBER = {
  minStake: 100,
  maxStake: 1000,
  pool: 50,
  pick: 5,
  intervalMinutes: 15, // production (planification Cloud Scheduler)
  devIntervalMinutes: 5, // émulateur : tirages plus rapprochés pour tester
  multipliers: { 2: 2, 3: 10, 4: 100 },
  jackpotAmount: 1000000,
};

// Tire 5 numéros distincts sur 1 à 50 (sans remise).
function drawLuckyNumbers() {
  const pool = Array.from({ length: LUCKY_NUMBER.pool }, (_, index) => index + 1);
  const drawn = [];
  for (let i = 0; i < LUCKY_NUMBER.pick; i += 1) {
    const index = crypto.randomInt(pool.length);
    drawn.push(pool.splice(index, 1)[0]);
  }
  return drawn.sort((a, b) => a - b);
}

// Gain d'une mise selon le nombre de bons numéros.
function luckyNumberPayout(stake, matches, multipliers = LUCKY_NUMBER.multipliers, jackpotAmount = LUCKY_NUMBER.jackpotAmount) {
  if (matches === LUCKY_NUMBER.pick) return jackpotAmount;
  const multiplier = multipliers[matches];
  return multiplier ? Math.floor(stake * multiplier) : 0;
}

// Jackpot quotidien : un ticket = 1 000 FCFA, dont 80 % alimentent la cagnotte.
// Tirage chaque jour à 20 h (UTC, comme le Togo). Un gagnant tiré au hasard parmi les tickets.
const JACKPOT = {
  ticketPrice: 1000,
  potShare: 0.8,
  winnerCount: 1,
  maxTicketsPerOrder: 10,
  drawHourUtc: 20,
  recentWinnersKept: 5,
};

// Prochain tirage (20 h UTC) strictement après l'instant donné.
function nextJackpotDraw(afterMs) {
  const date = new Date(afterMs);
  date.setUTCHours(JACKPOT.drawHourUtc, 0, 0, 0);
  if (date.getTime() <= afterMs) date.setUTCDate(date.getUTCDate() + 1);
  return date.getTime();
}

// Gain = mise × multiplicateur, arrondi au centime avant de tronquer (évite 202,99… au lieu de 203).
function payoutFor(stake, multiplier) {
  return Math.floor(Math.round(stake * multiplier * 100) / 100);
}

// Crash : une manche commune. Le multiplicateur part de 1,00× et suit e^(growthRate × secondes).
// Il explose au point de crash, tiré à l'avance par le serveur. Le joueur encaisse avant l'explosion.
const CRASH = {
  enabled: true,
  minStake: 100,
  maxStake: 10000,
  stakeChips: [100, 500, 1000, 2000, 5000, 10000],
  bettingSeconds: 10, // durée de la phase de mise avant le départ
  growthRate: 0.06, // vitesse de montée de la courbe
  houseRtp: 0.9, // retour théorique au joueur
  maxMultiplier: 100, // point de crash plafonné
  minAutoCashout: 1.01,
  maxExposurePerRound: 5000000, // total des gains possibles acceptés sur une manche (solvabilité)
  recentCrashesKept: 8,
};

// Point de crash : P(crash ≥ m) = rtp / m. Plancher à 1,00×, plafond à maxMultiplier.
function drawCrashPoint(rtp, maxMultiplier) {
  const u = crypto.randomInt(2 ** 32) / 2 ** 32; // entre 0 (inclus) et 1 (exclu)
  const raw = Math.floor((rtp / (1 - u)) * 100) / 100;
  return Math.min(Math.max(1, raw), maxMultiplier);
}

// Multiplicateur atteint après un temps écoulé (en secondes), tronqué à 2 décimales.
function crashMultiplierAt(growthRate, seconds) {
  return Math.floor(Math.exp(growthRate * seconds) * 100) / 100;
}

// Temps (en secondes) pour atteindre le point de crash.
function crashSecondsFor(growthRate, crashPoint) {
  return Math.log(crashPoint) / growthRate;
}

// Répartition de la cagnotte entre les gagnants, au prorata de leurs tickets dans le tirage.
// winners : [{ uid, name, tickets }]. Renvoie la même liste avec prize (entier). La somme des parts vaut exactement pot ;
// le reste de l'arrondi va au gagnant qui a le plus de tickets.
function splitJackpot(pot, winners) {
  const total = winners.reduce((sum, w) => sum + w.tickets, 0);
  if (total <= 0 || winners.length === 0) return winners.map((w) => ({ ...w, prize: 0 }));
  let distributed = 0;
  const shares = winners.map((w) => {
    const prize = Math.floor((pot * w.tickets) / total);
    distributed += prize;
    return { ...w, prize };
  });
  const top = shares.reduce((best, s, i) => (s.tickets > shares[best].tickets ? i : best), 0);
  shares[top].prize += pot - distributed;
  return shares;
}

module.exports = {
  splitJackpot,
  JACKPOT,
  nextJackpotDraw,
  LUCKY_NUMBER,
  drawLuckyNumbers,
  luckyNumberPayout,
  LUCKY_SPIN,
  pickLuckySpinSegment,
  luckySpinRtp,
  MYSTERY_BOX,
  drawMysteryBoxes,
  mysteryBoxRtp,
  CRASH,
  drawCrashPoint,
  crashMultiplierAt,
  crashSecondsFor,
  payoutFor,
};
