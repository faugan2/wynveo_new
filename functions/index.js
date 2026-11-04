// Version de déploiement : à changer pour forcer la mise à jour des fonctions (Firebase ignore un code inchangé).
const DEPLOY_VERSION = '2026-11-04-1';
console.log('Version de déploiement des fonctions :', DEPLOY_VERSION);

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const crypto = require('crypto');
const { isValidPhone } = require('./countries');
const { pickLuckySpinSegment, LUCKY_SPIN, drawMysteryBoxes, MYSTERY_BOX } = require('./games');
const { drawLuckyNumbers, luckyNumberPayout, LUCKY_NUMBER } = require('./games');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { JACKPOT, nextJackpotDraw, CRASH, drawCrashPoint, crashMultiplierAt, crashSecondsFor, payoutFor } = require('./games');
const { defineSecret } = require('firebase-functions/params');
const { runSportOddsImport } = require('./sport/importOdds');
const { LIMITS, priceSelections, checkCoupon, potentialPayout } = require('./sport/betRules');
const { MAIN_TOTAL_LINE } = require('./sport/odds');
const { runSportSettlement } = require('./sport/settle');
const { CRYPTO_CHAINS, tokenConfig } = require('./payments/chains');
const { SETTINGS, VALIDATORS, requireAdmin } = require('./admin/adminCore');
const { readTokenMetadata, blockNumber, getReceipt } = require('./payments/rpc');
const { DEFAULT_RATE_XOF_PER_USD, DEFAULT_MIN_DEPOSIT_XOF, DEFAULT_EXPIRY_MINUTES, UNIQUE_SUFFIX_MAX, expectedUnits, formatUnits, findTransfer, hasConfirmations } = require('./payments/deposits');

// Clé de The Odds API : secret Firebase en production, variable ODDS_API_KEY dans functions/.env en émulateur.
const oddsApiKey = defineSecret('ODDS_API_KEY');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'europe-west1';
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Réglages d'un jeu ou d'une fonction, lus dans wy_settings/{name}.
// Chaque clé absente du document prend sa valeur par défaut (celle du code).
async function gameSettings(name, defaults) {
  const snapshot = await db.collection('wy_settings').doc(name).get();
  return { ...defaults, ...(snapshot.exists ? snapshot.data() : {}) };
}

// Réglages du jackpot (prix du ticket, part vers la cagnotte) à partir du document wy_settings/jackpot.
function parseJackpotConfig(data) {
  const settings = data || {};
  const ticketPrice = Number.isInteger(settings.ticketPrice) && settings.ticketPrice > 0 ? settings.ticketPrice : JACKPOT.ticketPrice;
  const potShare = typeof settings.potShare === 'number' && settings.potShare > 0 && settings.potShare <= 1 ? settings.potShare : JACKPOT.potShare;
  return { ticketPrice, potShare };
}

// Parrainage : 5 niveaux. Pourcentage du dépôt reçu par chaque parrain, du niveau 1 au niveau 5.
// Valeurs par défaut, réglables dans wy_settings/referral (clé rates).
const MAX_REFERRAL_LEVELS = 5;
const REFERRAL_RATES = [10, 5, 3, 2, 1];

async function referralRates() {
  const { rates } = await gameSettings('referral', { rates: REFERRAL_RATES });
  return rates.slice(0, MAX_REFERRAL_LEVELS);
}
const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Code parrain de 8 caractères, sans caractères ambigus (0/O, 1/I).
function generateReferralCode() {
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += REFERRAL_ALPHABET[crypto.randomInt(REFERRAL_ALPHABET.length)];
  }
  return code;
}

// Clé de document : le numéro lui-même, pour garantir un numéro = un compte.
const phoneKey = (phone) => phone.replace(/\D/g, '');

// Renvoie l'e-mail du compte à partir du numéro, pour la connexion.
// Réponse neutre si le numéro est inconnu, pour ne pas révéler les comptes existants.
exports.getLoginEmail = onCall({ region: REGION }, async (request) => {
  const phone = request.data?.phone;
  if (typeof phone !== 'string' || !isValidPhone(phone)) {
    throw new HttpsError('invalid-argument', 'Numéro invalide.');
  }

  const snapshot = await db.collection('wy_phones').doc(phoneKey(phone)).get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Numéro ou mot de passe incorrect.');
  }
  return { email: snapshot.get('email') };
});

// Crée le compte : Firebase Auth + profil wy_users/{uid} + index wy_phones/{numéro}, dans une transaction.
exports.registerAccount = onCall({ region: REGION }, async (request) => {
  const { fullName, phone, email, password, referralCode: referralInput = '', acceptedTerms } = request.data || {};

  if (typeof fullName !== 'string' || fullName.trim().length < 2) {
    throw new HttpsError('invalid-argument', 'Le nom complet est obligatoire.');
  }
  if (typeof phone !== 'string' || !isValidPhone(phone)) {
    throw new HttpsError('invalid-argument', 'Numéro invalide.');
  }
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    throw new HttpsError('invalid-argument', 'Adresse e-mail invalide.');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpsError('invalid-argument', 'Le mot de passe doit contenir 8 caractères minimum.');
  }
  if (acceptedTerms !== true) {
    throw new HttpsError('invalid-argument', 'Vous devez confirmer avoir 18 ans ou plus.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const key = phoneKey(phone);
  const phoneRef = db.collection('wy_phones').doc(key);

  if ((await phoneRef.get()).exists) {
    throw new HttpsError('already-exists', 'Ce numéro est déjà utilisé.');
  }

  // Parrain : le code saisi doit exister. La chaîne des parrains (5 niveaux max) est copiée sur le nouveau compte.
  const parentCode = typeof referralInput === 'string' ? referralInput.trim().toUpperCase() : '';
  let referrerId = null;
  let referrerChain = [];
  if (parentCode) {
    const codeSnapshot = await db.collection('wy_referral_codes').doc(parentCode).get();
    if (!codeSnapshot.exists) {
      throw new HttpsError('invalid-argument', 'Code parrain invalide.');
    }
    referrerId = codeSnapshot.get('uid');
    const referrerSnapshot = await db.collection('wy_users').doc(referrerId).get();
    referrerChain = [referrerId, ...(referrerSnapshot.get('referrerChain') || [])].slice(0, MAX_REFERRAL_LEVELS);
  }
  const ownCode = generateReferralCode();

  let userRecord;
  try {
    userRecord = await getAuth().createUser({
      email: cleanEmail,
      password,
      displayName: fullName.trim(),
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Cette adresse e-mail est déjà utilisée.');
    }
    console.error('registerAccount : createUser a échoué', err);
    throw new HttpsError('internal', 'Création du compte impossible.');
  }

  try {
    await db.runTransaction(async (tx) => {
      // Le numéro doit rester unique même en cas de deux inscriptions simultanées.
      if ((await tx.get(phoneRef)).exists) {
        throw new HttpsError('already-exists', 'Ce numéro est déjà utilisé.');
      }
      const codeRef = db.collection('wy_referral_codes').doc(ownCode);
      if ((await tx.get(codeRef)).exists) {
        throw new HttpsError('internal', 'Création du compte impossible, réessayez.');
      }
      tx.set(phoneRef, { uid: userRecord.uid, email: cleanEmail });
      tx.set(codeRef, { uid: userRecord.uid });
      tx.set(db.collection('wy_users').doc(userRecord.uid), {
        fullName: fullName.trim(),
        phone,
        email: cleanEmail,
        referralCode: ownCode,
        referredBy: parentCode || null,
        referrerId,
        referrerChain,
        verified: false,
        balance: { real: 0, bonus: 0, withdrawable: 0 },
        acceptedTermsAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    // Annule la création Auth si le profil n'a pas pu être écrit.
    await getAuth().deleteUser(userRecord.uid);
    if (err instanceof HttpsError) throw err;
    console.error('registerAccount : écriture du profil a échoué', err);
    throw new HttpsError('internal', 'Création du compte impossible.');
  }

  return { uid: userRecord.uid };
});

// Prénom et initiale du nom : « Kossi A. ». Aucun téléphone ni e-mail n'est jamais renvoyé.
function maskName(fullName = '') {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] || '';
  const last = parts[1];
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

// Réseau du parrain connecté : nombre de filleuls et bonus générés par niveau, puis la liste des filleuls.
exports.getMyReferrals = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const uid = request.auth.uid;

  // Tous les descendants ont mon uid dans leur chaîne ; le niveau est la position de mon uid dans cette chaîne.
  const [membersSnapshot, bonusesSnapshot] = await Promise.all([
    db.collection('wy_users').where('referrerChain', 'array-contains', uid).get(),
    db.collection('wy_referral_bonuses').where('referrerId', '==', uid).get(),
  ]);

  const bonusByReferred = new Map();
  const levelBonus = Array(MAX_REFERRAL_LEVELS).fill(0);
  bonusesSnapshot.forEach((doc) => {
    const { referredId, amount, level } = doc.data();
    bonusByReferred.set(referredId, (bonusByReferred.get(referredId) || 0) + amount);
    levelBonus[level - 1] += amount;
  });

  const levelCount = Array(MAX_REFERRAL_LEVELS).fill(0);
  const members = [];
  membersSnapshot.forEach((doc) => {
    const data = doc.data();
    const level = data.referrerChain.indexOf(uid) + 1;
    if (level < 1 || level > MAX_REFERRAL_LEVELS) return;
    levelCount[level - 1] += 1;
    members.push({
      name: maskName(data.fullName),
      level,
      bonusGenerated: bonusByReferred.get(doc.id) || 0,
    });
  });

  const rates = await referralRates();
  return {
    levels: rates.map((rate, index) => ({
      level: index + 1,
      rate,
      count: levelCount[index],
      bonusTotal: levelBonus[index],
    })),
    members: members.sort((a, b) => a.level - b.level),
  };
});

// Dernières opérations du compte connecté : dépôts et bonus de parrainage reçus, les plus récents d'abord.
exports.getMyOperations = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const uid = request.auth.uid;
  const LIMIT = 20;

  const [depositsSnapshot, bonusesSnapshot, betsSnapshot] = await Promise.all([
    db.collection('wy_deposits').where('uid', '==', uid).get(),
    db.collection('wy_referral_bonuses').where('referrerId', '==', uid).get(),
    db.collection('wy_bets').where('uid', '==', uid).get(),
  ]);

  const toMillis = (value) => (value && value.toMillis ? value.toMillis() : 0);
  const operations = [];

  depositsSnapshot.forEach((doc) => {
    const data = doc.data();
    operations.push({
      id: doc.id,
      label: 'Dépôt',
      amount: data.amount,
      createdAt: toMillis(data.createdAt),
    });
  });

  bonusesSnapshot.forEach((doc) => {
    const data = doc.data();
    operations.push({
      id: doc.id,
      label: `Bonus parrainage (niveau ${data.level})`,
      amount: data.amount,
      createdAt: toMillis(data.createdAt),
    });
  });

  // Paris : le montant affiché est le gain net (gain moins mise). Une mise perdue est négative.
  const GAME_LABELS = {
    'lucky-spin': 'Lucky Spin',
    'mystery-box': 'Mystery Box',
    'lucky-number': 'Lucky Number',
    crash: 'Crash',
    sport: 'Sport',
  };
  betsSnapshot.forEach((doc) => {
    const data = doc.data();
    // Un pari Lucky Number reste en attente tant que son tirage n'a pas eu lieu.
    if (typeof data.payout !== 'number') return;
    const gameLabel = GAME_LABELS[data.game] || data.game;
    const result =
      data.game === 'lucky-number' ? `${data.matches} bons numéros` : `${data.multiplier}x`;
    operations.push({
      id: doc.id,
      label: `${gameLabel} · mise ${data.stake} · ${result}`,
      amount: data.payout - data.stake,
      createdAt: toMillis(data.createdAt),
    });
  });

  return {
    operations: operations.sort((a, b) => b.createdAt - a.createdAt).slice(0, LIMIT),
  };
});

// Lucky Spin : débite la mise, tire une case, crédite le gain et enregistre le pari.
// La mise est prise sur le solde des dépôts, puis sur le bonus. Le gain suit la même répartition.
exports.playLuckySpin = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const { minStake: MIN_STAKE, maxStake: MAX_STAKE, segments } = await gameSettings('lucky-spin', LUCKY_SPIN);
  const stake = Number(request.data?.stake);
  if (!Number.isInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
    throw new HttpsError('invalid-argument', 'Mise invalide.');
  }

  const uid = request.auth.uid;
  const userRef = db.collection('wy_users').doc(uid);
  const betRef = db.collection('wy_bets').doc();
  const segmentIndex = pickLuckySpinSegment(segments);
  const { multiplier } = segments[segmentIndex];
  const payout = Math.floor(stake * multiplier);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(userRef);
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Profil introuvable.');
    }

    const data = snapshot.data();
    const balance = { real: 0, bonus: 0, withdrawable: 0, ...(data.balance || {}) };
    if (balance.real + balance.bonus < stake) {
      throw new HttpsError('failed-precondition', 'Solde insuffisant.');
    }

    // Mise : d'abord l'argent déposé, puis le bonus. Le gain reprend la même proportion.
    const realUsed = Math.min(balance.real, stake);
    const bonusUsed = stake - realUsed;
    const payoutReal = Math.floor((payout * realUsed) / stake);
    const payoutBonus = payout - payoutReal;

    tx.update(userRef, {
      'balance.real': FieldValue.increment(payoutReal - realUsed),
      'balance.bonus': FieldValue.increment(payoutBonus - bonusUsed),
    });
    tx.set(betRef, {
      uid,
      game: 'lucky-spin',
      stake,
      segmentIndex,
      multiplier,
      payout,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      segmentIndex,
      multiplier,
      stake,
      payout,
      balance: {
        real: balance.real - realUsed + payoutReal,
        bonus: balance.bonus - bonusUsed + payoutBonus,
        withdrawable: balance.withdrawable,
      },
    };
  });
});

// Mystery Box : tire les 9 coffres, gagne le coffre choisi (mise × multiplicateur).
// Même répartition de la mise et du gain que Lucky Spin (dépôts d'abord, puis bonus).
exports.playMysteryBox = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const { minStake: MIN_STAKE, maxStake: MAX_STAKE, outcomes, boxCount } = await gameSettings('mystery-box', MYSTERY_BOX);
  const stake = Number(request.data?.stake);
  const boxIndex = Number(request.data?.boxIndex);
  if (!Number.isInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
    throw new HttpsError('invalid-argument', 'Mise invalide.');
  }
  if (!Number.isInteger(boxIndex) || boxIndex < 0 || boxIndex >= boxCount) {
    throw new HttpsError('invalid-argument', 'Coffre invalide.');
  }

  const uid = request.auth.uid;
  const userRef = db.collection('wy_users').doc(uid);
  const betRef = db.collection('wy_bets').doc();
  const boxes = drawMysteryBoxes(outcomes, boxCount);
  const multiplier = boxes[boxIndex];
  const payout = Math.floor(stake * multiplier);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(userRef);
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Profil introuvable.');
    }

    const data = snapshot.data();
    const balance = { real: 0, bonus: 0, withdrawable: 0, ...(data.balance || {}) };
    if (balance.real + balance.bonus < stake) {
      throw new HttpsError('failed-precondition', 'Solde insuffisant.');
    }

    const realUsed = Math.min(balance.real, stake);
    const bonusUsed = stake - realUsed;
    const payoutReal = Math.floor((payout * realUsed) / stake);
    const payoutBonus = payout - payoutReal;

    tx.update(userRef, {
      'balance.real': FieldValue.increment(payoutReal - realUsed),
      'balance.bonus': FieldValue.increment(payoutBonus - bonusUsed),
    });
    tx.set(betRef, {
      uid,
      game: 'mystery-box',
      stake,
      boxIndex,
      boxes,
      multiplier,
      payout,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      boxIndex,
      boxes,
      multiplier,
      stake,
      payout,
      balance: {
        real: balance.real - realUsed + payoutReal,
        bonus: balance.bonus - bonusUsed + payoutBonus,
        withdrawable: balance.withdrawable,
      },
    };
  });
});

// Lucky Number : un tirage ouvert à la fois. Les paris s'y rattachent jusqu'au tirage suivant.
// Transaction : plusieurs appels simultanés ne créent jamais deux tirages ouverts, et le numéro du tirage
// est attribué une seule fois. L'identifiant du tirage ouvert est gardé dans wy_settings/lucky-number.openDrawId.
async function ensureOpenLuckyNumberDraw() {
  // En émulateur, les tirages sont plus rapprochés (5 min) ; en production, toutes les 15 min.
  const intervalMinutes =
    process.env.FUNCTIONS_EMULATOR === 'true' ? LUCKY_NUMBER.devIntervalMinutes : LUCKY_NUMBER.intervalMinutes;
  const settingsRef = db.collection('wy_settings').doc('lucky-number');
  return db.runTransaction(async (tx) => {
    const settings = (await tx.get(settingsRef)).data() || {};
    if (settings.openDrawId) {
      const drawSnapshot = await tx.get(db.collection('wy_lucky_draws').doc(settings.openDrawId));
      if (drawSnapshot.exists && drawSnapshot.get('status') === 'open') {
        return {
          id: drawSnapshot.id,
          drawAt: drawSnapshot.get('drawAt').toMillis(),
          number: drawSnapshot.get('number') || null,
        };
      }
    }
    const number = (settings.drawCounter || 0) + 1;
    const drawAt = Timestamp.fromMillis(Date.now() + intervalMinutes * 60 * 1000);
    const ref = db.collection('wy_lucky_draws').doc();
    tx.set(ref, { status: 'open', number, drawAt, createdAt: FieldValue.serverTimestamp() });
    tx.set(settingsRef, { drawCounter: number, openDrawId: ref.id }, { merge: true });
    return { id: ref.id, drawAt: drawAt.toMillis(), number };
  });
}

// Règlement : ferme le tirage en cours, tire les numéros, règle chaque pari, ouvre le tirage suivant.
async function settleLuckyNumberDraw() {
  const current = await ensureOpenLuckyNumberDraw();
  const numbers = drawLuckyNumbers();
  const drawRef = db.collection('wy_lucky_draws').doc(current.id);

  // Fermer d'abord : un pari déposé pendant le règlement sera refusé.
  await drawRef.update({ status: 'closed', numbers, closedAt: FieldValue.serverTimestamp() });
  // Garde les 5 derniers tirages terminés (numéros et heure de fin), pour la section « Derniers tirages ».
  const settingsRef = db.collection('wy_settings').doc('lucky-number');
  const settingsSnapshot = await settingsRef.get();
  const previousDraws = settingsSnapshot.exists ? settingsSnapshot.get('recentDraws') || [] : [];
  const recentDraws = [{ drawId: current.id, number: current.number, numbers, closedAt: Date.now() }, ...previousDraws].slice(0, 5);
  await settingsRef.set({ lastDrawId: current.id, lastNumbers: numbers, recentDraws }, { merge: true });

  const { multipliers, jackpotAmount } = await gameSettings('lucky-number', LUCKY_NUMBER);
  const betsSnapshot = await db.collection('wy_bets').where('drawId', '==', current.id).get();
  for (const doc of betsSnapshot.docs) {
    const bet = doc.data();
    if (bet.status !== 'open') continue;
    const matches = bet.numbers.filter((number) => numbers.includes(number)).length;
    const payout = luckyNumberPayout(bet.stake, matches, multipliers, jackpotAmount);
    const payoutReal = Math.floor((payout * bet.realUsed) / bet.stake);
    const payoutBonus = payout - payoutReal;

    await db.runTransaction(async (tx) => {
      tx.update(db.collection('wy_users').doc(bet.uid), {
        'balance.real': FieldValue.increment(payoutReal),
        'balance.bonus': FieldValue.increment(payoutBonus),
      });
      tx.update(doc.ref, { status: 'settled', matches, payout, settledAt: FieldValue.serverTimestamp() });
    });
  }

  await ensureOpenLuckyNumberDraw();
  return { drawId: current.id, numbers };
}

// Tirage automatique toutes les 15 minutes (Cloud Scheduler).
exports.luckyNumberDrawScheduled = onSchedule({ schedule: 'every 15 minutes', region: REGION }, async () => {
  await settleLuckyNumberDraw();
});

// Test : tire le numéro maintenant (émulateur seulement).
exports.runLuckyNumberDrawNow = onCall({ region: REGION }, async () => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new HttpsError('permission-denied', 'Tirage manuel disponible uniquement en test.');
  }
  return settleLuckyNumberDraw();
});

// État du jeu : prochain tirage, numéros du dernier tirage, paris du joueur sur le tirage en cours.
exports.getLuckyNumberState = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const uid = request.auth.uid;
  const current = await ensureOpenLuckyNumberDraw();
  const settings = await db.collection('wy_settings').doc('lucky-number').get();
  const betsSnapshot = await db.collection('wy_bets').where('uid', '==', uid).get();

  const myBets = [];
  const settled = [];
  betsSnapshot.forEach((doc) => {
    const bet = doc.data();
    if (bet.game !== 'lucky-number') return;
    if (bet.drawId === current.id) {
      myBets.push({ numbers: bet.numbers, stake: bet.stake });
    }
    if (bet.status === 'settled') {
      settled.push({
        drawId: bet.drawId,
        numbers: bet.numbers,
        stake: bet.stake,
        matches: bet.matches,
        payout: bet.payout,
        settledAt: bet.settledAt ? bet.settledAt.toMillis() : 0,
      });
    }
  });

  // Historique : les 10 derniers tirages réglés, avec les numéros tirés de chaque tirage.
  const recent = settled.sort((a, b) => b.settledAt - a.settledAt).slice(0, 10);
  const drawSnapshots = await Promise.all(
    recent.map((item) => db.collection('wy_lucky_draws').doc(item.drawId).get())
  );
  const history = recent.map((item, index) => ({
    ...item,
    drawNumber: drawSnapshots[index].exists ? drawSnapshots[index].get('number') || null : null,
    drawNumbers: drawSnapshots[index].exists ? drawSnapshots[index].get('numbers') || [] : [],
  }));

  return {
    drawId: current.id,
    drawNumber: current.number,
    drawAt: current.drawAt,
    lastNumbers: settings.exists ? settings.get('lastNumbers') || [] : [],
    recentDraws: settings.exists ? settings.get('recentDraws') || [] : [],
    myBets,
    history,
    pick: LUCKY_NUMBER.pick,
    pool: LUCKY_NUMBER.pool,
  };
});

// Lucky Number : un pari sur le tirage en cours. Mise et gain répartis comme les autres jeux.
exports.playLuckyNumber = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const { minStake: MIN_STAKE, maxStake: MAX_STAKE } = await gameSettings('lucky-number', LUCKY_NUMBER);
  const stake = Number(request.data?.stake);
  const numbers = request.data?.numbers;
  if (!Number.isInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
    throw new HttpsError('invalid-argument', 'Mise invalide.');
  }
  const valid =
    Array.isArray(numbers) &&
    numbers.length === LUCKY_NUMBER.pick &&
    numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= LUCKY_NUMBER.pool) &&
    new Set(numbers).size === LUCKY_NUMBER.pick;
  if (!valid) {
    throw new HttpsError('invalid-argument', 'Choisissez 5 numéros différents entre 1 et 50.');
  }

  const uid = request.auth.uid;
  const userRef = db.collection('wy_users').doc(uid);
  const betRef = db.collection('wy_bets').doc();
  const current = await ensureOpenLuckyNumberDraw();
  const drawRef = db.collection('wy_lucky_draws').doc(current.id);

  return db.runTransaction(async (tx) => {
    const drawSnapshot = await tx.get(drawRef);
    if (!drawSnapshot.exists || drawSnapshot.get('status') !== 'open') {
      throw new HttpsError('failed-precondition', 'Tirage en cours, réessayez dans un instant.');
    }
    const snapshot = await tx.get(userRef);
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Profil introuvable.');
    }

    const data = snapshot.data();
    const balance = { real: 0, bonus: 0, withdrawable: 0, ...(data.balance || {}) };
    if (balance.real + balance.bonus < stake) {
      throw new HttpsError('failed-precondition', 'Solde insuffisant.');
    }

    const realUsed = Math.min(balance.real, stake);
    const bonusUsed = stake - realUsed;

    tx.update(userRef, {
      'balance.real': FieldValue.increment(-realUsed),
      'balance.bonus': FieldValue.increment(-bonusUsed),
    });
    tx.set(betRef, {
      uid,
      game: 'lucky-number',
      drawId: current.id,
      numbers: [...numbers].sort((a, b) => a - b),
      stake,
      realUsed,
      bonusUsed,
      status: 'open',
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      drawId: current.id,
      drawAt: current.drawAt,
      stake,
      balance: {
        real: balance.real - realUsed,
        bonus: balance.bonus - bonusUsed,
        withdrawable: balance.withdrawable,
      },
    };
  });
});

// Jackpot : un tour ouvert à la fois. Le tour ouvert a un tirage à 20 h (UTC).
// Transaction : plusieurs appels simultanés (accueil, page Jackpot, achats) ne créent jamais deux tours ouverts.
// L'identifiant du tour ouvert est gardé dans wy_settings/jackpot.openRoundId.
async function ensureOpenJackpotRound() {
  const settingsRef = db.collection('wy_settings').doc('jackpot');
  return db.runTransaction(async (tx) => {
    const settings = (await tx.get(settingsRef)).data() || {};
    if (settings.openRoundId) {
      const roundSnapshot = await tx.get(db.collection('wy_jackpot_rounds').doc(settings.openRoundId));
      if (roundSnapshot.exists && roundSnapshot.get('status') === 'open') {
        return { id: roundSnapshot.id, drawAt: roundSnapshot.get('drawAt').toMillis() };
      }
    }
    const drawAt = nextJackpotDraw(Math.max(Date.now(), settings.lastDrawAt || 0));
    const ref = db.collection('wy_jackpot_rounds').doc();
    tx.set(ref, { status: 'open', drawAt: Timestamp.fromMillis(drawAt), pot: 0, ticketsCount: 0 });
    tx.set(settingsRef, { openRoundId: ref.id }, { merge: true });
    return { id: ref.id, drawAt };
  });
}

// Tirage : clôt le tour ouvert, tire un ticket au hasard, verse la cagnotte, ouvre le tour suivant.
async function settleJackpotRound() {
  const current = await ensureOpenJackpotRound();
  const roundRef = db.collection('wy_jackpot_rounds').doc(current.id);
  await roundRef.update({ status: 'closing' });

  const round = (await roundRef.get()).data();
  let winnerUid = null;
  let winnerName = '';
  if (round.ticketsCount > 0) {
    const index = crypto.randomInt(round.ticketsCount);
    const ticketSnapshot = await db
      .collection('wy_jackpot_tickets')
      .where('roundId', '==', current.id)
      .where('index', '==', index)
      .limit(1)
      .get();
    winnerUid = ticketSnapshot.docs[0].get('uid');
    const winnerSnapshot = await db.collection('wy_users').doc(winnerUid).get();
    winnerName = maskName(winnerSnapshot.get('fullName'));
    await db.runTransaction(async (tx) => {
      tx.update(db.collection('wy_users').doc(winnerUid), { 'balance.real': FieldValue.increment(round.pot) });
    });
  }

  await roundRef.update({ status: 'closed', winnerUid, winnerName, prize: winnerUid ? round.pot : 0 });

  const settingsRef = db.collection('wy_settings').doc('jackpot');
  const settings = await settingsRef.get();
  const previous = settings.exists ? settings.get('recentWinners') || [] : [];
  const recentWinners = winnerUid
    ? [{ roundId: current.id, winnerName, prize: round.pot, closedAt: Date.now() }, ...previous].slice(0, JACKPOT.recentWinnersKept)
    : previous;
  await settingsRef.set({ lastDrawAt: current.drawAt, recentWinners }, { merge: true });

  await ensureOpenJackpotRound();
  return { roundId: current.id, prize: winnerUid ? round.pot : 0, winnerName };
}

// Tirage automatique chaque jour à 20 h (UTC).
exports.jackpotDrawScheduled = onSchedule({ schedule: '0 20 * * *', timeZone: 'UTC', region: REGION }, async () => {
  await settleJackpotRound();
});

// Test : tire le jackpot maintenant (émulateur seulement).
exports.runJackpotDrawNow = onCall({ region: REGION }, async () => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new HttpsError('permission-denied', 'Tirage manuel disponible uniquement en test.');
  }
  return settleJackpotRound();
});

// État du jackpot : cagnotte, tickets du joueur, compte à rebours et derniers gagnants.
exports.getJackpotState = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const uid = request.auth.uid;
  const current = await ensureOpenJackpotRound();
  const round = (await db.collection('wy_jackpot_rounds').doc(current.id).get()).data();
  const myTickets = await db
    .collection('wy_jackpot_tickets')
    .where('roundId', '==', current.id)
    .where('uid', '==', uid)
    .get();
  const settings = await db.collection('wy_settings').doc('jackpot').get();
  const { ticketPrice, potShare } = parseJackpotConfig(settings.data());

  return {
    roundId: current.id,
    drawAt: current.drawAt,
    pot: round.pot,
    ticketsCount: round.ticketsCount,
    myTickets: myTickets.size,
    recentWinners: settings.exists ? settings.get('recentWinners') || [] : [],
    ticketPrice,
    potShare,
  };
});

// Achat de tickets : le prix et la part vers la cagnotte viennent de wy_settings/jackpot.
exports.playJackpot = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const quantity = Number(request.data?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > JACKPOT.maxTicketsPerOrder) {
    throw new HttpsError('invalid-argument', 'Nombre de tickets invalide.');
  }

  const uid = request.auth.uid;
  const current = await ensureOpenJackpotRound();
  const roundRef = db.collection('wy_jackpot_rounds').doc(current.id);
  const userRef = db.collection('wy_users').doc(uid);
  const settingsRef = db.collection('wy_settings').doc('jackpot');

  return db.runTransaction(async (tx) => {
    const roundSnapshot = await tx.get(roundRef);
    if (roundSnapshot.get('status') !== 'open') {
      throw new HttpsError('failed-precondition', 'Tirage en cours, réessayez dans un instant.');
    }
    const userSnapshot = await tx.get(userRef);
    if (!userSnapshot.exists) {
      throw new HttpsError('not-found', 'Profil introuvable.');
    }
    const { ticketPrice, potShare } = parseJackpotConfig((await tx.get(settingsRef)).data());
    const cost = quantity * ticketPrice;
    const potAdd = Math.floor(cost * potShare);

    const data = userSnapshot.data();
    const balance = { real: 0, bonus: 0, withdrawable: 0, ...(data.balance || {}) };
    if (balance.real + balance.bonus < cost) {
      throw new HttpsError('failed-precondition', 'Solde insuffisant.');
    }

    const realUsed = Math.min(balance.real, cost);
    const bonusUsed = cost - realUsed;
    const startIndex = roundSnapshot.get('ticketsCount') || 0;

    tx.update(userRef, {
      'balance.real': FieldValue.increment(-realUsed),
      'balance.bonus': FieldValue.increment(-bonusUsed),
    });
    tx.update(roundRef, {
      pot: FieldValue.increment(potAdd),
      ticketsCount: FieldValue.increment(quantity),
    });
    for (let i = 0; i < quantity; i += 1) {
      tx.set(db.collection('wy_jackpot_tickets').doc(), {
        uid,
        roundId: current.id,
        index: startIndex + i,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      roundId: current.id,
      quantity,
      balance: {
        real: balance.real - realUsed,
        bonus: balance.bonus - bonusUsed,
        withdrawable: balance.withdrawable,
      },
    };
  });
});

// Crash : la manche en cours. Une nouvelle manche s'ouvre dès que la précédente a explosé.
// Le document wy_settings/crash garde l'id de la manche en cours, le compteur et l'heure de fin de la dernière manche.
async function ensureCrashRound(config) {
  const settingsRef = db.collection('wy_settings').doc('crash');
  const roundsRef = db.collection('wy_crash_rounds');
  return db.runTransaction(async (tx) => {
    const settingsSnapshot = await tx.get(settingsRef);
    const settings = settingsSnapshot.exists ? settingsSnapshot.data() : {};
    const now = Date.now();

    if (settings.currentRoundId) {
      const currentSnapshot = await tx.get(roundsRef.doc(settings.currentRoundId));
      if (currentSnapshot.exists && currentSnapshot.get('crashAt') > now) {
        return { id: currentSnapshot.id, ...currentSnapshot.data() };
      }
    }

    // Phase de mise : le départ vient après la fin de la manche précédente, puis dure bettingSeconds.
    const number = (settings.roundCounter || 0) + 1;
    const crashPoint = drawCrashPoint(config.houseRtp, config.maxMultiplier);
    const startedAt = Math.max(now, settings.lastCrashAt || 0) + config.bettingSeconds * 1000;
    const crashAt = startedAt + crashSecondsFor(config.growthRate, crashPoint) * 1000;
    const ref = roundsRef.doc();
    const round = {
      number,
      crashPoint,
      growthRate: config.growthRate,
      startedAt,
      crashAt,
      exposure: 0,
      pendingSettlement: true,
    };
    tx.set(ref, round);
    tx.set(settingsRef, { currentRoundId: ref.id, roundCounter: number, lastCrashAt: crashAt }, { merge: true });
    return { id: ref.id, ...round };
  });
}

// Répartit un gain entre dépôts et bonus, dans la même proportion que la mise.
function splitPayout(payout, bet) {
  const payoutReal = Math.floor((payout * bet.realUsed) / bet.stake);
  return { payoutReal, payoutBonus: payout - payoutReal };
}

// Règlement d'une manche explosée. Un pari dont le retrait automatique est atteint avant l'explosion est payé ;
// tous les autres sont perdus. Idempotent : un pari déjà réglé n'est pas touché une deuxième fois.
async function settleCrashRound(roundId) {
  const roundRef = db.collection('wy_crash_rounds').doc(roundId);
  const round = (await roundRef.get()).data();
  const config = await gameSettings('crash', CRASH);

  const betsSnapshot = await db.collection('wy_bets').where('roundId', '==', roundId).where('game', '==', 'crash').get();
  for (const doc of betsSnapshot.docs) {
    await db.runTransaction(async (tx) => {
      const bet = (await tx.get(doc.ref)).data();
      if (bet.status !== 'open') return;

      const target = bet.autoCashout;
      const won = Boolean(target) && target <= round.crashPoint;
      const multiplier = won ? target : 0;
      const payout = payoutFor(bet.stake, multiplier);
      if (won) {
        const { payoutReal, payoutBonus } = splitPayout(payout, bet);
        tx.update(db.collection('wy_users').doc(bet.uid), {
          'balance.real': FieldValue.increment(payoutReal),
          'balance.bonus': FieldValue.increment(payoutBonus),
        });
      }
      tx.update(doc.ref, { status: won ? 'cashed' : 'lost', multiplier, payout, settledAt: FieldValue.serverTimestamp() });
    });
  }

  await db.runTransaction(async (tx) => {
    const roundSnapshot = await tx.get(roundRef);
    if (!roundSnapshot.get('pendingSettlement')) return;
    const settingsRef = db.collection('wy_settings').doc('crash');
    const settings = await tx.get(settingsRef);
    const previous = settings.exists ? settings.get('recentCrashes') || [] : [];
    tx.update(roundRef, { pendingSettlement: false });
    tx.set(settingsRef, { recentCrashes: [round.crashPoint, ...previous].slice(0, config.recentCrashesKept) }, { merge: true });
  });
}

// Règle les manches explosées qui ne l'ont pas encore été. Appelé à chaque lecture du jeu et par le planificateur.
async function settleDueCrashRounds() {
  const now = Date.now();
  const pending = await db.collection('wy_crash_rounds').where('pendingSettlement', '==', true).get();
  for (const doc of pending.docs) {
    if (doc.get('crashAt') <= now) await settleCrashRound(doc.id);
  }
}

// Manche : état public (sans le point de crash avant l'explosion), pari du joueur et joueurs de la manche.
exports.getCrashState = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const uid = request.auth.uid;
  const config = await gameSettings('crash', CRASH);
  await settleDueCrashRounds();
  const current = await ensureCrashRound(config);

  // Le client peut demander une manche précédente : elle est forcément explosée.
  const requestedId = typeof request.data?.roundId === 'string' ? request.data.roundId : null;
  let round = current;
  if (requestedId && requestedId !== current.id) {
    const snapshot = await db.collection('wy_crash_rounds').doc(requestedId).get();
    if (snapshot.exists) round = { id: snapshot.id, ...snapshot.data() };
  }

  const now = Date.now();
  let status = 'betting';
  if (round.id !== current.id || now >= round.crashAt) status = 'crashed';
  else if (now >= round.startedAt) status = 'flying';

  const betsSnapshot = await db.collection('wy_bets').where('roundId', '==', round.id).where('game', '==', 'crash').get();
  const bets = betsSnapshot.docs.map((doc) => doc.data());
  const userSnapshots = bets.length ? await db.getAll(...bets.map((bet) => db.collection('wy_users').doc(bet.uid))) : [];
  const names = new Map(userSnapshots.map((snapshot) => [snapshot.id, maskName(snapshot.get('fullName'))]));

  const players = bets
    .map((bet) => ({
      name: names.get(bet.uid) || '',
      stake: bet.stake,
      autoCashout: bet.autoCashout || null,
      status: bet.status,
      multiplier: bet.status === 'open' ? null : bet.multiplier,
      payout: bet.status === 'open' ? null : bet.payout,
      isMe: bet.uid === uid,
    }))
    .sort((a, b) => b.stake - a.stake)
    .slice(0, 30);
  const mine = bets.find((bet) => bet.uid === uid);

  return {
    roundId: round.id,
    status,
    serverNow: now,
    startedAt: round.startedAt,
    growthRate: round.growthRate,
    crashPoint: status === 'crashed' ? round.crashPoint : null,
    multiplier: status === 'flying' ? crashMultiplierAt(round.growthRate, (now - round.startedAt) / 1000) : null,
    myBet: mine
      ? {
          stake: mine.stake,
          autoCashout: mine.autoCashout || null,
          status: mine.status,
          multiplier: mine.status === 'open' ? null : mine.multiplier,
          payout: mine.status === 'open' ? null : mine.payout,
        }
      : null,
    players,
    recentCrashes: config.recentCrashes || [],
    config: {
      enabled: config.enabled,
      minStake: config.minStake,
      maxStake: config.maxStake,
      stakeChips: config.stakeChips,
      bettingSeconds: config.bettingSeconds,
      maxMultiplier: config.maxMultiplier,
      minAutoCashout: config.minAutoCashout,
    },
  };
});

// Pari sur la manche en phase de mise. Un pari par joueur et par manche.
exports.playCrash = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const config = await gameSettings('crash', CRASH);
  if (!config.enabled) {
    throw new HttpsError('failed-precondition', 'Le jeu est indisponible pour le moment.');
  }
  const stake = Number(request.data?.stake);
  if (!Number.isInteger(stake) || stake < config.minStake || stake > config.maxStake) {
    throw new HttpsError('invalid-argument', 'Mise invalide.');
  }
  let autoCashout = null;
  if (request.data?.autoCashout !== undefined && request.data?.autoCashout !== null) {
    const value = Number(request.data.autoCashout);
    if (!Number.isFinite(value) || value < config.minAutoCashout || value > config.maxMultiplier) {
      throw new HttpsError('invalid-argument', 'Retrait automatique invalide.');
    }
    autoCashout = Math.floor(value * 100) / 100;
  }

  await settleDueCrashRounds();
  const round = await ensureCrashRound(config);
  if (Date.now() >= round.startedAt) {
    throw new HttpsError('failed-precondition', 'La manche est lancée, réessayez à la prochaine.');
  }

  const uid = request.auth.uid;
  const roundRef = db.collection('wy_crash_rounds').doc(round.id);
  const betRef = db.collection('wy_bets').doc(`crash_${round.id}_${uid}`);
  const userRef = db.collection('wy_users').doc(uid);
  // Gain maximal possible de ce pari : sert à limiter le total des gains d'une manche.
  const potential = stake * Math.min(autoCashout || config.maxMultiplier, config.maxMultiplier);

  return db.runTransaction(async (tx) => {
    const roundSnapshot = await tx.get(roundRef);
    if (Date.now() >= roundSnapshot.get('startedAt')) {
      throw new HttpsError('failed-precondition', 'La manche est lancée, réessayez à la prochaine.');
    }
    if ((roundSnapshot.get('exposure') || 0) + potential > config.maxExposurePerRound) {
      throw new HttpsError('failed-precondition', 'Mise trop élevée pour cette manche, réduisez-la.');
    }
    const betSnapshot = await tx.get(betRef);
    if (betSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'Vous avez déjà misé sur cette manche.');
    }
    const userSnapshot = await tx.get(userRef);
    if (!userSnapshot.exists) {
      throw new HttpsError('not-found', 'Profil introuvable.');
    }

    const balance = { real: 0, bonus: 0, withdrawable: 0, ...(userSnapshot.data().balance || {}) };
    if (balance.real + balance.bonus < stake) {
      throw new HttpsError('failed-precondition', 'Solde insuffisant.');
    }
    const realUsed = Math.min(balance.real, stake);
    const bonusUsed = stake - realUsed;

    tx.update(userRef, {
      'balance.real': FieldValue.increment(-realUsed),
      'balance.bonus': FieldValue.increment(-bonusUsed),
    });
    tx.update(roundRef, { exposure: FieldValue.increment(potential) });
    tx.set(betRef, {
      uid,
      game: 'crash',
      roundId: round.id,
      stake,
      realUsed,
      bonusUsed,
      autoCashout,
      status: 'open',
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      roundId: round.id,
      stake,
      autoCashout,
      balance: {
        real: balance.real - realUsed,
        bonus: balance.bonus - bonusUsed,
        withdrawable: balance.withdrawable,
      },
    };
  });
});

// Retrait manuel : encaisse la mise au multiplicateur atteint à l'instant, tant que la manche n'a pas explosé.
exports.cashoutCrash = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const roundId = request.data?.roundId;
  if (typeof roundId !== 'string' || !roundId) {
    throw new HttpsError('invalid-argument', 'Manche invalide.');
  }

  const uid = request.auth.uid;
  const roundRef = db.collection('wy_crash_rounds').doc(roundId);
  const betRef = db.collection('wy_bets').doc(`crash_${roundId}_${uid}`);
  const userRef = db.collection('wy_users').doc(uid);

  return db.runTransaction(async (tx) => {
    const roundSnapshot = await tx.get(roundRef);
    if (!roundSnapshot.exists) {
      throw new HttpsError('not-found', 'Manche introuvable.');
    }
    const round = roundSnapshot.data();
    const now = Date.now();
    if (now < round.startedAt || now >= round.crashAt) {
      throw new HttpsError('failed-precondition', 'Retrait impossible : la manche n\'est pas en cours.');
    }
    const betSnapshot = await tx.get(betRef);
    if (!betSnapshot.exists || betSnapshot.get('status') !== 'open') {
      throw new HttpsError('failed-precondition', 'Aucun pari en cours sur cette manche.');
    }
    const userSnapshot = await tx.get(userRef);
    const bet = betSnapshot.data();
    const balance = { real: 0, bonus: 0, withdrawable: 0, ...(userSnapshot.data().balance || {}) };

    const multiplier = crashMultiplierAt(round.growthRate, (now - round.startedAt) / 1000);
    const payout = payoutFor(bet.stake, multiplier);
    const { payoutReal, payoutBonus } = splitPayout(payout, bet);

    tx.update(userRef, {
      'balance.real': FieldValue.increment(payoutReal),
      'balance.bonus': FieldValue.increment(payoutBonus),
    });
    tx.update(betRef, { status: 'cashed', multiplier, payout, settledAt: FieldValue.serverTimestamp() });

    return {
      multiplier,
      payout,
      balance: {
        real: balance.real - bet.realUsed + payoutReal,
        bonus: balance.bonus - bet.bonusUsed + payoutBonus,
        withdrawable: balance.withdrawable,
      },
    };
  });
});

// Import des cotes Sport toutes les 3 heures (The Odds API).
exports.sportOddsImportScheduled = onSchedule(
  { schedule: 'every 3 hours', region: REGION, secrets: [oddsApiKey] },
  async () => {
    await runSportOddsImport(db, oddsApiKey.value());
  }
);

// Relevé des scores et règlement des paris Sport, toutes les 20 minutes.
// Ne consomme des crédits que s'il y a un match démarré dans les 4 dernières heures.
exports.sportSettlementScheduled = onSchedule(
  { schedule: 'every 20 minutes', region: REGION, secrets: [oddsApiKey] },
  async () => {
    await runSportSettlement(db, oddsApiKey.value());
  }
);

// Test : relève les scores et règle les paris maintenant (émulateur seulement).
exports.runSportSettlementNow = onCall({ region: REGION, secrets: [oddsApiKey] }, async () => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new HttpsError('permission-denied', 'Règlement manuel disponible uniquement en test.');
  }
  return runSportSettlement(db, oddsApiKey.value());
});

// Test : lance l'import des cotes maintenant (émulateur seulement).
exports.runSportOddsImportNow = onCall({ region: REGION, secrets: [oddsApiKey] }, async () => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new HttpsError('permission-denied', 'Import manuel disponible uniquement en test.');
  }
  return runSportOddsImport(db, oddsApiKey.value());
});

// Règlement automatique des manches explosées, même si personne ne consulte le jeu.
exports.crashTickScheduled = onSchedule({ schedule: 'every 1 minutes', region: REGION }, async () => {
  await settleDueCrashRounds();
});

// Erreurs des règles de pari : renvoyées au client avec leur code et leur message.
function asHttpsError(error) {
  if (error instanceof HttpsError) return error;
  return new HttpsError(error.code || 'internal', error.message, error.details);
}

// Pari Sport. Simple : un ticket par choix, chacun de la même mise. Combiné : un ticket pour tous les choix.
// Les cotes sont relues dans wy_sport_events au moment de la validation. Si elles ont changé, le client doit
// renvoyer la demande avec acceptChanges: true.
exports.playSport = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const { mode, acceptChanges } = request.data || {};
  const stake = Number(request.data?.stake);
  const selections = Array.isArray(request.data?.selections)
    ? request.data.selections.map((item) => ({
        eventId: String(item?.eventId || ''),
        pick: item?.pick,
        price: Number(item?.price),
      }))
    : [];
  try {
    checkCoupon({ mode, stake, selections });
  } catch (error) {
    throw asHttpsError(error);
  }

  const uid = request.auth.uid;
  const now = Date.now();
  const userRef = db.collection('wy_users').doc(uid);
  const eventRefs = [...new Set(selections.map((selection) => selection.eventId))].map((id) =>
    db.collection('wy_sport_events').doc(id)
  );

  return db.runTransaction(async (tx) => {
    // Toutes les lectures avant les écritures.
    const eventSnapshots = await Promise.all(eventRefs.map((ref) => tx.get(ref)));
    const userSnapshot = await tx.get(userRef);
    const events = new Map();
    eventSnapshots.forEach((snapshot) => {
      if (!snapshot.exists) return;
      events.set(snapshot.id, {
        status: snapshot.get('status'),
        commenceTimeMs: snapshot.get('commenceTime')?.toMillis() || 0,
        oddsUpdatedMs: snapshot.get('oddsUpdatedAt')?.toMillis() || 0,
        odds: snapshot.get('odds') || null,
        homeTeam: snapshot.get('homeTeam'),
        awayTeam: snapshot.get('awayTeam'),
      });
    });

    let priced;
    try {
      priced = priceSelections(selections, events, now);
    } catch (error) {
      throw asHttpsError(error);
    }
    if (priced.changes.length > 0 && acceptChanges !== true) {
      throw new HttpsError('aborted', 'Les cotes ont changé. Acceptez les nouvelles cotes pour continuer.', {
        changes: priced.changes,
      });
    }

    if (!userSnapshot.exists) {
      throw new HttpsError('not-found', 'Profil introuvable.');
    }
    const balance = { real: 0, bonus: 0, withdrawable: 0, ...(userSnapshot.data().balance || {}) };
    const tickets = mode === 'combo' ? [priced.lines] : priced.lines.map((line) => [line]);
    const totalStake = stake * tickets.length;
    if (balance.real + balance.bonus < totalStake) {
      throw new HttpsError('failed-precondition', 'Solde insuffisant.');
    }

    let realLeft = Math.min(balance.real, totalStake);
    const realUsed = realLeft;
    const bets = tickets.map((legs) => {
      const { totalPrice, payout } = potentialPayout(stake, legs.map((leg) => leg.price));
      if (payout > LIMITS.maxPayout) {
        throw new HttpsError('invalid-argument', 'Gain maximum dépassé : réduisez la mise.');
      }
      const ticketReal = Math.min(realLeft, stake);
      realLeft -= ticketReal;
      return {
        ref: db.collection('wy_bets').doc(),
        data: {
          uid,
          game: 'sport',
          mode,
          stake,
          eventIds: legs.map((leg) => leg.eventId),
          realUsed: ticketReal,
          bonusUsed: stake - ticketReal,
          selections: legs.map((leg) => ({
            eventId: leg.eventId,
            pick: leg.pick,
            price: leg.price,
            homeTeam: leg.homeTeam,
            awayTeam: leg.awayTeam,
            commenceTime: Timestamp.fromMillis(leg.commenceTimeMs),
          })),
          totalPrice,
          potentialPayout: payout,
          status: 'open',
          createdAt: FieldValue.serverTimestamp(),
        },
        summary: { id: null, totalPrice, potentialPayout: payout },
      };
    });

    tx.update(userRef, {
      'balance.real': FieldValue.increment(-realUsed),
      'balance.bonus': FieldValue.increment(-(totalStake - realUsed)),
    });
    bets.forEach((bet) => tx.set(bet.ref, bet.data));

    return {
      bets: bets.map((bet) => ({ ...bet.summary, id: bet.ref.id })),
      totalStake,
      changes: priced.changes,
      balance: {
        real: balance.real - realUsed,
        bonus: balance.bonus - (totalStake - realUsed),
        withdrawable: balance.withdrawable,
      },
    };
  });
});

// Mes paris Sport du compte connecté, les plus récents d'abord. Le libellé du choix est calculé ici.
exports.getMySportBets = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const snapshot = await db
    .collection('wy_bets')
    .where('uid', '==', request.auth.uid)
    .where('game', '==', 'sport')
    .get();

  const labelFor = (selection) => {
    if (selection.pick === 'home') return selection.homeTeam;
    if (selection.pick === 'away') return selection.awayTeam;
    if (selection.pick === 'draw') return 'Nul';
    return `${selection.pick === 'over' ? 'Plus' : 'Moins'} de ${MAIN_TOTAL_LINE} buts`;
  };

  const bets = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      mode: data.mode,
      stake: data.stake,
      status: data.status,
      totalPrice: data.totalPrice,
      potentialPayout: data.potentialPayout,
      payout: typeof data.payout === 'number' ? data.payout : null,
      selections: data.selections.map((selection) => ({
        label: labelFor(selection),
        price: selection.price,
        homeTeam: selection.homeTeam,
        awayTeam: selection.awayTeam,
        commenceMs: selection.commenceTime ? selection.commenceTime.toMillis() : 0,
      })),
      createdAt: data.createdAt ? data.createdAt.toMillis() : 0,
    };
  });
  return { bets: bets.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50) };
});

// Dépôts crypto : demande de dépôt, puis confirmation après vérification de la transaction sur la blockchain.
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

// Paramètres des dépôts crypto (wy_settings/payments). L'adresse de réception doit être renseignée par l'admin.
async function cryptoSettings() {
  return gameSettings('payments', {
    adminAddress: null,
    rateXofPerUsd: DEFAULT_RATE_XOF_PER_USD,
    minDepositXof: DEFAULT_MIN_DEPOSIT_XOF,
    expiryMinutes: DEFAULT_EXPIRY_MINUTES,
  });
}

// Vérifie sur la blockchain que le contrat est bien le token attendu (symbole et décimales).
async function assertTokenOnChain(chain, token) {
  const onChain = await readTokenMetadata(chain.rpcUrl, token.address);
  if (onChain.symbol !== token.symbol || onChain.decimals !== token.decimals) {
    console.error('Token inattendu sur la chaîne', token.address, onChain);
    throw new HttpsError('failed-precondition', 'Token non reconnu : dépôt impossible.');
  }
}

// Demande de dépôt crypto : montant exact à envoyer, unique parmi les demandes en attente.
// Paramètres affichés à l'écran de dépôt crypto (minimum, taux, durée). Aucune adresse ni secret.
exports.getCryptoDepositSettings = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const settings = await cryptoSettings();
  return {
    minDepositXof: settings.minDepositXof,
    rateXofPerUsd: settings.rateXofPerUsd,
    expiryMinutes: settings.expiryMinutes,
  };
});

exports.createCryptoDeposit = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const found = tokenConfig(request.data?.token);
  if (!found) {
    throw new HttpsError('invalid-argument', 'Token non accepté.');
  }
  const settings = await cryptoSettings();
  if (!ADDRESS_PATTERN.test(settings.adminAddress || '')) {
    throw new HttpsError('failed-precondition', 'Dépôts crypto indisponibles pour le moment.');
  }
  const amountXof = Number(request.data?.amountXof);
  if (!Number.isInteger(amountXof) || amountXof < settings.minDepositXof) {
    throw new HttpsError('invalid-argument', 'Montant invalide.');
  }

  const { token, chain, network } = found;
  await assertTokenOnChain(chain, token);

  // Montant unique : on tire un décalage jusqu'à trouver un montant libre parmi les demandes en attente.
  let units = null;
  for (let attempt = 0; attempt < 5 && units === null; attempt += 1) {
    const candidate = expectedUnits(amountXof, settings.rateXofPerUsd, token.decimals, crypto.randomInt(1, UNIQUE_SUFFIX_MAX + 1));
    const clash = await db
      .collection('wy_crypto_deposits')
      .where('status', '==', 'pending')
      .where('token', '==', token.symbol)
      .where('expectedUnits', '==', candidate.toString())
      .limit(1)
      .get();
    if (clash.empty) units = candidate;
  }
  if (units === null) {
    throw new HttpsError('unavailable', 'Demande impossible pour le moment, réessayez.');
  }

  const expiresAt = Date.now() + settings.expiryMinutes * 60 * 1000;
  const ref = db.collection('wy_crypto_deposits').doc();
  await ref.set({
    uid: request.auth.uid,
    status: 'pending',
    token: token.symbol,
    network,
    chainId: chain.chainId,
    tokenAddress: token.address,
    toAddress: settings.adminAddress,
    amountXof,
    rateXofPerUsd: settings.rateXofPerUsd,
    decimals: token.decimals,
    expectedUnits: units.toString(),
    expiresAt: Timestamp.fromMillis(expiresAt),
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    depositId: ref.id,
    token: token.symbol,
    network,
    chainId: chain.chainId,
    tokenAddress: token.address,
    toAddress: settings.adminAddress,
    amount: formatUnits(units, token.decimals),
    expiresAt,
  };
});

// Confirmation d'un dépôt crypto : le navigateur envoie le hash, le serveur vérifie la transaction puis crédite une seule fois.
exports.confirmCryptoDeposit = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const uid = request.auth.uid;
  const depositId = request.data?.depositId;
  const txHash = request.data?.txHash;
  if (typeof depositId !== 'string' || !depositId) {
    throw new HttpsError('invalid-argument', 'Demande de dépôt invalide.');
  }
  if (typeof txHash !== 'string' || !TX_HASH_PATTERN.test(txHash)) {
    throw new HttpsError('invalid-argument', 'Hash de transaction invalide.');
  }

  const depositRef = db.collection('wy_crypto_deposits').doc(depositId);
  const depositSnap = await depositRef.get();
  if (!depositSnap.exists) {
    throw new HttpsError('not-found', 'Demande de dépôt introuvable.');
  }
  const deposit = depositSnap.data();
  if (deposit.uid !== uid) {
    throw new HttpsError('permission-denied', 'Cette demande ne vous appartient pas.');
  }
  if (deposit.status === 'credited') {
    return { status: 'credited', amountXof: deposit.amountXof };
  }
  if (deposit.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Cette demande n\'est plus valable.');
  }
  if (Date.now() > deposit.expiresAt.toMillis()) {
    await depositRef.update({ status: 'expired' });
    throw new HttpsError('failed-precondition', 'La demande a expiré. Créez une nouvelle demande.');
  }

  const chain = CRYPTO_CHAINS[deposit.network];
  const token = chain.tokens[deposit.token];
  await assertTokenOnChain(chain, token);

  const receipt = await getReceipt(chain.rpcUrl, txHash);
  if (!receipt) {
    return { status: 'pending', message: 'Transaction non encore visible sur la blockchain.' };
  }
  if (receipt.status !== '0x1') {
    throw new HttpsError('failed-precondition', 'La transaction a échoué sur la blockchain.');
  }
  const current = await blockNumber(chain.rpcUrl);
  const receiptBlock = Number(BigInt(receipt.blockNumber));
  if (!hasConfirmations(receiptBlock, current, chain.confirmations)) {
    return { status: 'confirming', confirmations: current - receiptBlock + 1, required: chain.confirmations };
  }

  const transfer = findTransfer(receipt, deposit.tokenAddress, deposit.toAddress, BigInt(deposit.expectedUnits));
  if (!transfer) {
    throw new HttpsError('failed-precondition', 'Aucun transfert correspondant à cette demande dans la transaction.');
  }

  const rates = await referralRates();
  const hashRef = db.collection('wy_crypto_tx').doc(txHash.toLowerCase());
  const userRef = db.collection('wy_users').doc(uid);

  return db.runTransaction(async (tx) => {
    // Lectures avant écritures. Un appel concurrent voit le dépôt déjà crédité.
    const freshDeposit = await tx.get(depositRef);
    if (freshDeposit.get('status') === 'credited') {
      return { status: 'credited', amountXof: freshDeposit.get('amountXof') };
    }
    const hashSnap = await tx.get(hashRef);
    if (hashSnap.exists) {
      throw new HttpsError('failed-precondition', 'Cette transaction a déjà été utilisée.');
    }
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'Profil introuvable.');
    }
    const chainUids = (userSnap.get('referrerChain') || []).slice(0, MAX_REFERRAL_LEVELS);
    const referrerSnaps = await Promise.all(chainUids.map((id) => tx.get(db.collection('wy_users').doc(id))));

    const amount = deposit.amountXof;
    const bonuses = [];
    chainUids.forEach((referrerUid, index) => {
      const bonus = Math.floor((amount * rates[index]) / 100);
      if (bonus > 0 && referrerSnaps[index].exists) bonuses.push({ referrerUid, level: index + 1, bonus });
    });

    const depositDocRef = db.collection('wy_deposits').doc();
    tx.update(userRef, { 'balance.real': FieldValue.increment(amount), verified: true });
    tx.set(depositDocRef, {
      uid,
      amount,
      status: 'confirmed',
      method: 'crypto',
      token: deposit.token,
      network: deposit.network,
      txHash,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(hashRef, { uid, depositId, from: transfer.from, createdAt: FieldValue.serverTimestamp() });
    tx.update(depositRef, { status: 'credited', txHash, from: transfer.from, creditedAt: FieldValue.serverTimestamp() });
    for (const credit of bonuses) {
      tx.update(db.collection('wy_users').doc(credit.referrerUid), { 'balance.bonus': FieldValue.increment(credit.bonus) });
      tx.set(db.collection('wy_referral_bonuses').doc(), {
        referrerId: credit.referrerUid,
        referredId: uid,
        depositId: depositDocRef.id,
        level: credit.level,
        amount: credit.bonus,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { status: 'credited', amountXof: amount };
  });
});

// Administration : rôle de l'appelant, lecture et modification des réglages, journal d'audit.
exports.adminMe = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(db, request);
  return { uid: admin.uid, role: admin.role };
});

exports.adminGetSettings = onCall({ region: REGION }, async (request) => {
  const name = request.data?.name;
  if (!SETTINGS[name]) throw new HttpsError('invalid-argument', 'Réglage inconnu.');
  await requireAdmin(db, request, SETTINGS[name].roles.concat(['support']));
  const snapshot = await db.collection('wy_settings').doc(name).get();
  return { name, values: snapshot.exists ? snapshot.data() : {} };
});

exports.adminSaveSettings = onCall({ region: REGION }, async (request) => {
  const name = request.data?.name;
  const values = request.data?.values;
  if (!SETTINGS[name]) throw new HttpsError('invalid-argument', 'Réglage inconnu.');
  const admin = await requireAdmin(db, request, SETTINGS[name].roles);
  if (!values || typeof values !== 'object') throw new HttpsError('invalid-argument', 'Valeurs manquantes.');
  const problem = VALIDATORS[name](values);
  if (problem) throw new HttpsError('invalid-argument', problem);

  const ref = db.collection('wy_settings').doc(name);
  const before = (await ref.get()).data() || {};
  await ref.set(values, { merge: true });
  await db.collection('wy_audit_log').add({
    uid: admin.uid,
    role: admin.role,
    action: 'settings.save',
    setting: name,
    before,
    after: values,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

exports.adminGetAuditLog = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request);
  const pageSize = adminPageSize(request.data?.pageSize);
  const cursor = parseAdminCursor(request.data?.cursor);
  const { rows, next } = await pageAcrossCollections(
    [{
      key: 'a',
      collection: 'wy_audit_log',
      filters: [],
      map: (doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          role: data.role,
          action: data.action,
          setting: data.setting,
          createdAt: data.createdAt ? data.createdAt.toMillis() : 0,
        };
      },
    }],
    cursor,
    pageSize
  );
  return { entries: rows, next };
});

// Administration : listes paginées par curseur (lecture seule). Une page lit au plus pageSize + 1 documents par collection,
// quel que soit le nombre total de lignes. Le curseur est la date du dernier élément affiché ; les éléments de même date
// déjà affichés sont exclus par identifiant, pour ne rien perdre ni répéter entre deux pages.
const ADMIN_PAGE_SIZE = 20;
const ADMIN_PAGE_MAX = 50;

function adminPageSize(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, ADMIN_PAGE_MAX) : ADMIN_PAGE_SIZE;
}

function parseAdminCursor(value) {
  if (!value || typeof value !== 'object') return null;
  const createdAt = Number(value.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
  const keys = Array.isArray(value.keys) ? value.keys.filter((k) => typeof k === 'string').slice(0, ADMIN_PAGE_MAX) : [];
  return { createdAt, keys };
}

// Lit une page dans une ou plusieurs collections, fusionnées par date décroissante.
// sources : [{ key, collection, filters: [[champ, opérateur, valeur]], map(doc) }]
async function pageAcrossCollections(sources, cursor, pageSize) {
  const fetched = await Promise.all(
    sources.map(async (source) => {
      let query = db.collection(source.collection);
      for (const [field, op, value] of source.filters || []) {
        query = query.where(field, op, value);
      }
      query = query.orderBy('createdAt', 'desc');
      if (cursor) query = query.where('createdAt', '<=', Timestamp.fromMillis(cursor.createdAt));
      const snapshot = await query.limit(pageSize + 1).get();
      return snapshot.docs.map((doc) => ({
        key: `${source.key}:${doc.id}`,
        createdAt: doc.get('createdAt')?.toMillis?.() || 0,
        row: source.map(doc),
      }));
    })
  );

  const merged = fetched
    .flat()
    .filter((item) => !(cursor && item.createdAt === cursor.createdAt && cursor.keys.includes(item.key)))
    .sort((a, b) => b.createdAt - a.createdAt);

  const pageItems = merged.slice(0, pageSize);
  let next = null;
  if (merged.length > pageSize && pageItems.length) {
    const last = pageItems[pageItems.length - 1].createdAt;
    next = { createdAt: last, keys: pageItems.filter((item) => item.createdAt === last).map((item) => item.key) };
  }
  return { rows: pageItems.map((item) => item.row), next };
}

function userRow(doc) {
  const data = doc.data();
  return {
    uid: doc.id,
    fullName: data.fullName || '',
    phone: data.phone || '',
    email: data.email || '',
    verified: Boolean(data.verified),
    balanceReal: data.balance?.real || 0,
    balanceBonus: data.balance?.bonus || 0,
    createdAt: data.createdAt ? data.createdAt.toMillis() : 0,
  };
}

// Liste des joueurs. Recherche exacte seulement : numéro (wy_phones) ou e-mail. Une recherche par nom
// demanderait de lire toute la collection, elle n'est donc pas proposée.
exports.adminListUsers = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request);
  const pageSize = adminPageSize(request.data?.pageSize);
  const cursor = parseAdminCursor(request.data?.cursor);
  const search = typeof request.data?.search === 'string' ? request.data.search.trim() : '';

  if (search) {
    const uids = new Set();
    const key = phoneKey(search);
    if (key) {
      const phoneSnap = await db.collection('wy_phones').doc(key).get();
      if (phoneSnap.exists) uids.add(phoneSnap.get('uid'));
    }
    if (search.includes('@')) {
      const byEmail = await db.collection('wy_users').where('email', '==', search.toLowerCase()).limit(5).get();
      byEmail.forEach((doc) => uids.add(doc.id));
    }
    const docs = await Promise.all([...uids].filter(Boolean).map((uid) => db.collection('wy_users').doc(uid).get()));
    return { users: docs.filter((doc) => doc.exists).map(userRow), next: null };
  }

  const verified = request.data?.verified;
  const filters = verified === 'oui' ? [['verified', '==', true]] : verified === 'non' ? [['verified', '==', false]] : [];
  return pageAcrossCollections(
    [{ key: 'u', collection: 'wy_users', filters, map: userRow }],
    cursor,
    pageSize
  ).then(({ rows, next }) => ({ users: rows, next }));
});

exports.adminGetUser = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request);
  const uid = request.data?.uid;
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Joueur invalide.');
  const userSnap = await db.collection('wy_users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'Joueur introuvable.');
  const user = userSnap.data();

  return {
    user: {
      uid,
      fullName: user.fullName || '',
      phone: user.phone || '',
      email: user.email || '',
      verified: Boolean(user.verified),
      referralCode: user.referralCode || '',
      balanceReal: user.balance?.real || 0,
      balanceBonus: user.balance?.bonus || 0,
      createdAt: user.createdAt ? user.createdAt.toMillis() : 0,
    },
  };
});

// Opérations d'un joueur (dépôts, dépôts crypto, paris), paginées, filtrables par type.
exports.adminListUserOperations = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request);
  const uid = request.data?.uid;
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Joueur invalide.');
  const pageSize = adminPageSize(request.data?.pageSize);
  const cursor = parseAdminCursor(request.data?.cursor);
  const type = request.data?.type;

  const GAMES = { 'lucky-spin': 'Lucky Spin', 'mystery-box': 'Mystery Box', 'lucky-number': 'Lucky Number', crash: 'Crash', sport: 'Sport', jackpot: 'Jackpot' };
  const sources = {
    deposit: {
      key: 'd',
      collection: 'wy_deposits',
      filters: [['uid', '==', uid]],
      map: (doc) => {
        const d = doc.data();
        return { id: doc.id, type: 'Dépôt', detail: d.method === 'crypto' ? `Crypto ${d.token || ''}` : 'Mobile Money', amount: d.amount || 0, status: d.status || '—', createdAt: d.createdAt ? d.createdAt.toMillis() : 0 };
      },
    },
    crypto: {
      key: 'c',
      collection: 'wy_crypto_deposits',
      filters: [['uid', '==', uid]],
      map: (doc) => {
        const d = doc.data();
        return { id: doc.id, type: 'Dépôt crypto', detail: `${d.token || ''} · ${d.network || ''}`, amount: d.amountXof || 0, status: d.status || '—', createdAt: d.createdAt ? d.createdAt.toMillis() : 0 };
      },
    },
    bet: {
      key: 'b',
      collection: 'wy_bets',
      filters: [['uid', '==', uid]],
      map: (doc) => {
        const d = doc.data();
        return { id: doc.id, type: 'Pari', detail: GAMES[d.game] || d.game || '', amount: -(d.stake || 0), status: d.status || '—', createdAt: d.createdAt ? d.createdAt.toMillis() : 0 };
      },
    },
  };
  const selected = {
    'Dépôt': [sources.deposit],
    'Dépôt crypto': [sources.crypto],
    'Pari': [sources.bet],
  }[type] || [sources.deposit, sources.crypto, sources.bet];

  const { rows, next } = await pageAcrossCollections(selected, cursor, pageSize);
  return { operations: rows, next };
});

// Administration : dépôts, du plus récent au plus ancien, paginés. Deux sources :
// 'crypto' = demandes de dépôt crypto (tous statuts), 'ledger' = crédits enregistrés dans wy_deposits.
exports.adminListDeposits = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request);
  const pageSize = adminPageSize(request.data?.pageSize);
  const cursor = parseAdminCursor(request.data?.cursor);
  const status = typeof request.data?.status === 'string' && request.data.status ? request.data.status.slice(0, 40) : '';
  const statusFilter = status ? [['status', '==', status]] : [];

  const source = request.data?.source === 'ledger'
    ? {
        key: 'l',
        collection: 'wy_deposits',
        filters: statusFilter,
        map: (doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            uid: d.uid || '',
            type: d.method === 'crypto' ? 'Crypto' : 'Mobile Money',
            detail: d.method === 'crypto' ? d.token || '' : d.method || 'Simulé',
            amount: d.amount || 0,
            status: d.status || '—',
            createdAt: d.createdAt ? d.createdAt.toMillis() : 0,
          };
        },
      }
    : {
        key: 'c',
        collection: 'wy_crypto_deposits',
        filters: statusFilter,
        map: (doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            uid: d.uid || '',
            type: 'Crypto',
            detail: `${d.token || ''} · ${d.network || ''}`,
            amount: d.amountXof || 0,
            status: d.status || '—',
            createdAt: d.createdAt ? d.createdAt.toMillis() : 0,
          };
        },
      };

  const { rows, next } = await pageAcrossCollections([source], cursor, pageSize);
  return { deposits: rows, next };
});

// Dépôt simulé, pour les tests : crédite le solde sans paiement réel.
// Refusé hors émulateur, pour ne jamais créditer un vrai compte sans paiement.
exports.simulateDeposit = onCall({ region: REGION }, async (request) => {
  const MAX_SIMULATED_DEPOSIT = 1000000;

  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new HttpsError('permission-denied', 'Dépôt simulé disponible uniquement en test.');
  }
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }

  const { minDeposit: MIN_DEPOSIT } = await gameSettings('deposit', { minDeposit: 1000 });
  const rates = await referralRates();
  const amount = Number(request.data?.amount);
  if (!Number.isInteger(amount) || amount < MIN_DEPOSIT || amount > MAX_SIMULATED_DEPOSIT) {
    throw new HttpsError('invalid-argument', 'Montant invalide.');
  }

  const uid = request.auth.uid;
  const userRef = db.collection('wy_users').doc(uid);
  const depositRef = db.collection('wy_deposits').doc();

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(userRef);
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Profil introuvable.');
    }

    const data = snapshot.data();
    const chain = (data.referrerChain || []).slice(0, MAX_REFERRAL_LEVELS);

    // Toutes les lectures doivent précéder les écritures dans une transaction.
    const referrerSnapshots = await Promise.all(
      chain.map((referrerUid) => tx.get(db.collection('wy_users').doc(referrerUid)))
    );

    // Un bonus par parrain de la chaîne, selon le niveau et le pourcentage du dépôt.
    const credits = [];
    chain.forEach((referrerUid, index) => {
      const bonus = Math.floor((amount * rates[index]) / 100);
      if (bonus > 0 && referrerSnapshots[index].exists) {
        credits.push({ referrerUid, level: index + 1, bonus });
      }
    });

    tx.update(userRef, { 'balance.real': FieldValue.increment(amount), verified: true });
    tx.set(depositRef, { uid, amount, status: 'simulated', createdAt: FieldValue.serverTimestamp() });

    for (const credit of credits) {
      tx.update(db.collection('wy_users').doc(credit.referrerUid), {
        'balance.bonus': FieldValue.increment(credit.bonus),
      });
      tx.set(db.collection('wy_referral_bonuses').doc(), {
        referrerId: credit.referrerUid,
        referredId: uid,
        depositId: depositRef.id,
        level: credit.level,
        amount: credit.bonus,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    const balance = data.balance || {};
    return {
      depositId: depositRef.id,
      amount,
      bonuses: credits.map(({ level, bonus }) => ({ level, bonus })),
      balance: {
        real: (balance.real || 0) + amount,
        bonus: balance.bonus || 0,
        withdrawable: balance.withdrawable || 0,
      },
    };
  });
});

// Fonctions de test (tirages et imports manuels) : exportées seulement dans l'émulateur, jamais déployées en production.
if (process.env.FUNCTIONS_EMULATOR !== 'true') {
  for (const name of ['runLuckyNumberDrawNow', 'runJackpotDrawNow', 'runSportSettlementNow', 'runSportOddsImportNow']) {
    delete exports[name];
  }
}
