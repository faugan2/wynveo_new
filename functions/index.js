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
const { JACKPOT, nextJackpotDraw, CRASH, drawCrashPoint, crashMultiplierAt, crashSecondsFor, payoutFor, splitJackpot } = require('./games');
const { defineSecret } = require('firebase-functions/params');
const { runSportOddsImport } = require('./sport/importOdds');
const { LIMITS, priceSelections, checkCoupon, potentialPayout } = require('./sport/betRules');
const { MAIN_TOTAL_LINE } = require('./sport/odds');
const { runSportSettlement, settleEventBets, legOutcome } = require('./sport/settle');
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
  const winnerCount = Number.isInteger(settings.winnerCount) && settings.winnerCount >= 1 && settings.winnerCount <= 10
    ? settings.winnerCount
    : JACKPOT.winnerCount;
  return { ticketPrice, potShare, winnerCount };
}

// Tire au hasard `winnerCount` tickets distincts parmi les `ticketsCount` du tirage, puis regroupe par joueur.
// Un joueur tiré plusieurs fois n'est compté qu'une fois, avec le total de ses tickets du tirage (son poids).
async function drawJackpotWinners(roundId, ticketsCount, winnerCount) {
  if (!(ticketsCount > 0)) return [];
  const wanted = Math.min(winnerCount, ticketsCount);
  const indexes = new Set();
  while (indexes.size < wanted) indexes.add(crypto.randomInt(ticketsCount));
  const drawn = await db
    .collection('wy_jackpot_tickets')
    .where('roundId', '==', roundId)
    .where('index', 'in', [...indexes])
    .get();
  const uids = [...new Set(drawn.docs.map((doc) => doc.get('uid')))];
  const winners = [];
  for (const uid of uids) {
    const count = await db
      .collection('wy_jackpot_tickets')
      .where('roundId', '==', roundId)
      .where('uid', '==', uid)
      .count()
      .get();
    const userSnap = await db.collection('wy_users').doc(uid).get();
    winners.push({ uid, name: maskName(userSnap.get('fullName')), tickets: count.data().count });
  }
  return winners;
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

// Historique paginé du compte connecté : dépôts, bonus de parrainage et paris réglés, les plus récents d'abord.
// Une page lit au plus pageSize + 1 documents par collection, quel que soit le nombre d'opérations du joueur.
exports.getMyOperationsPage = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const uid = request.auth.uid;
  const pageSize = adminPageSize(request.data?.pageSize);
  const cursor = parseAdminCursor(request.data?.cursor);
  const toMillis = (value) => (value && value.toMillis ? value.toMillis() : 0);
  const GAME_LABELS = {
    'lucky-spin': 'Lucky Spin',
    'mystery-box': 'Mystery Box',
    'lucky-number': 'Lucky Number',
    crash: 'Crash',
    sport: 'Sport',
  };

  // Filtre par type : seules les collections du type demandé sont lues.
  const TYPE_KEYS = { deposit: 'd', bonus: 'b', bet: 'p' };
  const type = request.data?.type;
  const wanted = Object.prototype.hasOwnProperty.call(TYPE_KEYS, type) ? TYPE_KEYS[type] : null;

  const sources = [
      {
        key: 'd',
        collection: 'wy_deposits',
        filters: [['uid', '==', uid]],
        map: (doc) => ({ id: doc.id, label: 'Dépôt', amount: doc.get('amount') ?? 0, createdAt: toMillis(doc.get('createdAt')) }),
      },
      {
        key: 'b',
        collection: 'wy_referral_bonuses',
        filters: [['referrerId', '==', uid]],
        map: (doc) => ({
          id: doc.id,
          label: `Bonus parrainage (niveau ${doc.get('level')})`,
          amount: doc.get('amount') ?? 0,
          createdAt: toMillis(doc.get('createdAt')),
        }),
      },
      {
        key: 'p',
        collection: 'wy_bets',
        filters: [['uid', '==', uid]],
        map: (doc) => {
          const data = doc.data();
          // Un pari non réglé (en cours, ou Lucky Number en attente de tirage) n'apparaît pas encore.
          if (typeof data.payout !== 'number') return null;
          const gameLabel = GAME_LABELS[data.game] || data.game;
          const result = data.game === 'lucky-number' ? `${data.matches} bons numéros` : `${data.multiplier}x`;
          return {
            id: doc.id,
            label: `${gameLabel} · mise ${data.stake} · ${result}`,
            amount: data.payout - data.stake,
            createdAt: toMillis(data.createdAt),
          };
        },
      },
  ];
  const { rows, next } = await pageAcrossCollections(
    wanted ? sources.filter((source) => source.key === wanted) : sources,
    cursor,
    pageSize
  );
  return { operations: rows.filter(Boolean), next };
});

// Mes paris (jeux) : paris de jeux du compte, les plus récents d'abord, par pages. Filtre : en cours, gagnés, perdus ou tous.
// Une source par jeu (une requête indexée chacune). Le résumé du jour (misé, gagné) n'est calculé qu'à la première page.
const GAME_NAMES = { 'lucky-spin': 'Lucky Spin', 'mystery-box': 'Mystery Box', 'lucky-number': 'Lucky Number', crash: 'Crash', jackpot: 'Jackpot' };

// Résultat d'un pari de jeu : enregistré au règlement (champ result). Sans ce champ (anciens paris), déduit du gain.
function gameBetStatus(data) {
  if (data.result) return data.result;
  if (data.status === 'void') return 'void';
  if (typeof data.payout !== 'number') return 'open';
  return data.payout > data.stake ? 'won' : 'lost';
}

// Filtres acceptés : open (en cours), won (gagnés), lost (perdus). Sans filtre : tous les paris de jeu.
const GAME_BET_FILTERS = {
  open: ['status', '==', 'open'],
  won: ['result', '==', 'won'],
  lost: ['result', '==', 'lost'],
};

exports.getMyGameBets = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const uid = request.auth.uid;
  const pageSize = adminPageSize(request.data?.pageSize);
  const cursor = parseAdminCursor(request.data?.cursor);
  const filter = GAME_BET_FILTERS[request.data?.status] || null;

  const sources = Object.keys(GAME_NAMES).map((game) => ({
    key: game,
    collection: 'wy_bets',
    filters: filter ? [['uid', '==', uid], ['game', '==', game], filter] : [['uid', '==', uid], ['game', '==', game]],
    map: (doc) => {
      const data = doc.data();
      const status = gameBetStatus(data);
      const payout = typeof data.payout === 'number' ? data.payout : null;
      return {
        id: doc.id,
        game,
        label: GAME_NAMES[game],
        stake: data.stake || 0,
        status,
        payout,
        createdAt: data.createdAt ? data.createdAt.toMillis() : 0,
      };
    },
  }));

  const { rows, next } = await pageAcrossCollections(sources, cursor, pageSize);

  // Résumé du jour (UTC) : mises et gains des paris de jeux placés aujourd'hui.
  let today = null;
  if (!cursor) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const todaySnap = await db
      .collection('wy_bets')
      .where('uid', '==', uid)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .limit(500)
      .get();
    today = { stake: 0, payout: 0 };
    todaySnap.forEach((doc) => {
      const data = doc.data();
      if (data.game === 'sport') return;
      today.stake += data.stake || 0;
      if (typeof data.payout === 'number') today.payout += data.payout;
    });
  }
  return { bets: rows, next, today };
});

// Administration (une fois) : écrit le champ result sur les anciens paris de jeux, déduit de leur statut et de leur gain.
// Traite 300 paris par appel ; renvoie le curseur suivant tant qu'il reste des paris à examiner.
exports.adminBackfillBetResults = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request, ['super_admin']);
  const { FieldPath } = require('firebase-admin/firestore');
  const cursor = typeof request.data?.cursor === 'string' ? request.data.cursor : null;
  let query = db.collection('wy_bets').orderBy(FieldPath.documentId()).limit(300);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();

  const batch = db.batch();
  let updated = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.game === 'sport' || data.result) return;
    let result = null;
    if (data.status === 'void') result = 'void';
    else if (typeof data.payout === 'number') result = data.payout > data.stake ? 'won' : 'lost';
    if (result) {
      batch.update(doc.ref, { result });
      updated += 1;
    }
  });
  if (updated > 0) await batch.commit();
  const last = snapshot.docs[snapshot.docs.length - 1];
  return { updated, scanned: snapshot.size, next: snapshot.size === 300 && last ? last.id : null };
});

// Détail d'un ticket sport : sélections avec leur résultat (calculé à partir du score du match, quand il est connu).
exports.getMySportBet = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const id = request.data?.id;
  if (typeof id !== 'string' || !id) throw new HttpsError('invalid-argument', 'Pari invalide.');
  const snapshot = await db.collection('wy_bets').doc(id).get();
  if (!snapshot.exists || snapshot.get('uid') !== request.auth.uid || snapshot.get('game') !== 'sport') {
    throw new HttpsError('not-found', 'Pari introuvable.');
  }
  const data = snapshot.data();

  const eventIds = [...new Set(data.selections.map((selection) => selection.eventId))];
  const eventSnaps = eventIds.length ? await db.getAll(...eventIds.map((eventId) => db.collection('wy_sport_events').doc(eventId))) : [];
  const eventById = new Map(eventSnaps.map((snap) => [snap.id, snap]));

  const labelFor = (selection) => {
    if (selection.pick === 'home') return selection.homeTeam;
    if (selection.pick === 'away') return selection.awayTeam;
    if (selection.pick === 'draw') return 'Nul';
    return `${selection.pick === 'over' ? 'Plus' : 'Moins'} de ${MAIN_TOTAL_LINE} buts`;
  };

  const selections = data.selections.map((selection) => {
    const event = eventById.get(selection.eventId);
    let outcome = 'pending';
    if (event && event.exists) {
      const eventStatus = event.get('status');
      const result = event.get('result');
      if (eventStatus === 'cancelled') outcome = 'void';
      else if (result) outcome = legOutcome(selection.pick, result, result.totalLine ?? MAIN_TOTAL_LINE);
    }
    return {
      label: labelFor(selection),
      price: selection.price,
      homeTeam: selection.homeTeam,
      awayTeam: selection.awayTeam,
      commenceMs: selection.commenceTime ? selection.commenceTime.toMillis() : 0,
      outcome,
    };
  });

  return {
    id,
    mode: data.mode,
    status: data.status,
    stake: data.stake,
    totalPrice: data.totalPrice,
    potentialPayout: data.potentialPayout,
    payout: typeof data.payout === 'number' ? data.payout : null,
    createdAt: data.createdAt ? data.createdAt.toMillis() : 0,
    settledAt: data.settledAt ? data.settledAt.toMillis() : 0,
    selections,
  };
});

// Contenu du héros de l'accueil (slides), réglable dans l'admin (wy_settings/home). Valeurs de départ si rien n'est réglé.
const DEFAULT_HOME_SLIDES = [
  {
    kicker: 'Jeux Wynveo',
    title: 'Tentez votre chance',
    text: 'Lucky Spin, Mystery Box, Crash et plus. Jouez avec votre solde.',
    ctaLabel: 'Créer un compte',
    ctaTarget: 'register',
    userCtaLabel: 'Jouer',
    userCtaTarget: 'games',
    imageUrl: '',
  },
  {
    kicker: 'Paris sportifs',
    title: 'Pariez sur le football',
    text: 'Cotes 1, N, 2 et plus ou moins 2,5 buts. Paris simples ou combinés.',
    ctaLabel: 'Créer un compte',
    ctaTarget: 'register',
    userCtaLabel: 'Voir les matchs',
    userCtaTarget: 'sport',
    imageUrl: '',
  },
  {
    kicker: 'Bonus de bienvenue',
    title: 'Commencez avec un bonus',
    text: 'Versé une seule fois, à votre premier dépôt confirmé.',
    ctaLabel: 'Créer un compte',
    ctaTarget: 'register',
    userCtaLabel: 'Mon espace',
    userCtaTarget: 'home',
    imageUrl: '',
  },
];

// Cartes à droite du héros (deux cartes : couleur de fond, image, titre, sous-titre, destination).
const DEFAULT_SIDE_CARDS = [
  { title: 'Paris sportifs', subtitle: 'Football : 1, N, 2 et plus ou moins 2,5 buts', color: '#2a2b2e', imageUrl: '', target: 'register' },
  { title: 'Bonus de bienvenue', subtitle: 'Versé à votre premier dépôt confirmé', color: '#2a2b2e', imageUrl: '', target: 'register' },
];

// Jeux de la rangée « Jeux Wynveo » : nom, description, couleur de secours, image (cadrée sur toute la carte), destination.
const DEFAULT_HOME_GAMES = [
  { key: 'spin', name: 'Lucky Spin', desc: 'Tournez la roue', color: '#6b2bd9', imageUrl: '', badge: '', target: 'register' },
  { key: 'box', name: 'Mystery Box', desc: 'Ouvrez la boîte', color: '#e0701a', imageUrl: '', badge: '', target: 'register' },
  { key: 'number', name: 'Lucky Number', desc: 'Trouvez les bons numéros', color: '#1a7fd1', imageUrl: '', badge: '', target: 'register' },
  { key: 'jackpot', name: 'Jackpot', desc: 'Tirage quotidien', color: '#b8860b', imageUrl: '', badge: '', target: 'register' },
  { key: 'crash', name: 'Crash', desc: 'Encaissez avant la chute', color: '#d12b4f', imageUrl: '', badge: '', target: 'register' },
];

// Public (sans connexion) : slides du héros, cartes à droite et jeux de l'accueil.
exports.getHomeContent = onCall({ region: REGION }, async () => {
  const snapshot = await db.collection('wy_settings').doc('home').get();
  const saved = snapshot.exists ? snapshot.get('slides') : null;
  const savedCards = snapshot.exists ? snapshot.get('sideCards') : null;
  const savedGames = snapshot.exists ? snapshot.get('games') : null;
  return {
    slides: Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_HOME_SLIDES,
    sideCards: Array.isArray(savedCards) && savedCards.length === 2 ? savedCards : DEFAULT_SIDE_CARDS,
    games: Array.isArray(savedGames) && savedGames.length > 0 ? savedGames : DEFAULT_HOME_GAMES,
  };
});

// Matchs visibles par les visiteurs (sans connexion) : données publiques seulement, sans cotes détaillées au-delà du 1 N 2 et du plus/moins.
// Les règles Firestore interdisent la lecture directe de wy_sport_events aux visiteurs.
function publicMatch(doc) {
  const data = doc.data();
  const odds = data.odds || null;
  return {
    id: doc.id,
    sportKey: data.sportKey || '',
    league: data.league || '',
    homeTeam: data.homeTeam || '',
    awayTeam: data.awayTeam || '',
    commenceMs: data.commenceTime ? data.commenceTime.toMillis() : 0,
    status: data.status || '',
    odds: odds
      ? { home: odds.home ?? null, draw: odds.draw ?? null, away: odds.away ?? null, over: odds.over ?? null, under: odds.under ?? null, line: odds.line ?? null }
      : null,
  };
}

// Nombre de parties jouées par jeu, pour les cartes de jeu (lecture publique, sans données personnelles).
// Chaque mise d'un jeu est une ligne de wy_bets (champ game) ; le jackpot compte ses tickets.
const GAME_PLAY_SOURCES = {
  'lucky-spin': () => db.collection('wy_bets').where('game', '==', 'lucky-spin'),
  'mystery-box': () => db.collection('wy_bets').where('game', '==', 'mystery-box'),
  'lucky-number': () => db.collection('wy_bets').where('game', '==', 'lucky-number'),
  crash: () => db.collection('wy_bets').where('game', '==', 'crash'),
  jackpot: () => db.collection('wy_jackpot_tickets'),
};

const isGameSlug = (slug) => typeof slug === 'string' && Object.prototype.hasOwnProperty.call(GAME_PLAY_SOURCES, slug);

exports.getGamePlayCounts = onCall({ region: REGION }, async () => {
  const entries = Object.entries(GAME_PLAY_SOURCES);
  const results = await Promise.all(entries.map(([, query]) => query().count().get()));
  const counts = {};
  entries.forEach(([slug], index) => {
    counts[slug] = results[index].data().count;
  });
  return { counts };
});

// Jeux favoris du membre connecté : un document par membre dans wy_game_favorites (lecture et écriture par ces fonctions seulement).
exports.getGameFavorites = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const snapshot = await db.collection('wy_game_favorites').doc(request.auth.uid).get();
  const slugs = snapshot.exists ? snapshot.get('slugs') : [];
  return { slugs: Array.isArray(slugs) ? slugs.filter(isGameSlug) : [] };
});

exports.setGameFavorite = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }
  const { slug, saved } = request.data || {};
  if (!isGameSlug(slug) || typeof saved !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Jeu ou choix invalide.');
  }
  await db
    .collection('wy_game_favorites')
    .doc(request.auth.uid)
    .set(
      { slugs: saved ? FieldValue.arrayUnion(slug) : FieldValue.arrayRemove(slug), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  return { ok: true };
});

// Prochains matchs de l'accueil visiteur : matchs à venir des compétitions visibles, les plus proches d'abord.
exports.getPublicMatches = onCall({ region: REGION }, async () => {
  const since = Timestamp.fromDate(new Date(Date.now() - 2 * 3600 * 1000));
  const [leagues, snapshot] = await Promise.all([
    db.collection('wy_sport_leagues').where('visible', '==', true).get(),
    db.collection('wy_sport_events').where('commenceTime', '>=', since).orderBy('commenceTime').limit(40).get(),
  ]);
  const visible = new Set(leagues.docs.map((doc) => doc.id));
  const matches = snapshot.docs
    .map(publicMatch)
    .filter((match) => match.status === 'upcoming' && (match.sportKey === 'manual' || visible.has(match.sportKey)))
    .slice(0, 6);
  return { matches };
});

// Détail d'un match pour un visiteur (page /sport/match/:id). Renvoie null si le match n'existe pas.
exports.getPublicMatch = onCall({ region: REGION }, async (request) => {
  const eventId = request.data?.eventId;
  if (typeof eventId !== 'string' || eventId.length === 0 || eventId.length > 100) {
    throw new HttpsError('invalid-argument', 'Match invalide.');
  }
  const snapshot = await db.collection('wy_sport_events').doc(eventId).get();
  return { match: snapshot.exists ? publicMatch(snapshot) : null };
});

// Administration : téléversement d'une image du héros (JPEG, PNG ou WebP, 2 Mo au maximum), rangée dans Firebase Storage.
// Renvoie un lien permanent (jeton de téléchargement Firebase), à enregistrer dans la slide.
const HOME_IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const HOME_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

exports.adminUploadHomeImage = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(db, request, ['super_admin', 'support']);
  const contentType = request.data?.contentType;
  const extension = HOME_IMAGE_TYPES[contentType];
  if (!extension) throw new HttpsError('invalid-argument', 'Format non accepté (JPEG, PNG ou WebP).');
  const payload = request.data?.data;
  if (typeof payload !== 'string' || payload.length === 0) throw new HttpsError('invalid-argument', 'Image vide.');
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0 || buffer.length > HOME_IMAGE_MAX_BYTES) {
    throw new HttpsError('invalid-argument', 'Image trop lourde (2 Mo maximum).');
  }

  const { getStorage } = require('firebase-admin/storage');
  const bucket = getStorage().bucket();
  const path = `home/${crypto.randomUUID()}.${extension}`;
  const token = crypto.randomUUID();
  await bucket.file(path).save(buffer, {
    resumable: false,
    metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
  });
  await db.collection('wy_audit_log').add({
    uid: admin.uid,
    role: admin.role,
    action: 'home.image',
    after: path,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {
    url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
  };
});

// Logo de l'application (réglé dans l'admin). Public : affiché dans l'en-tête de tous les écrans.
exports.getBranding = onCall({ region: REGION }, async () => {
  const branding = await gameSettings('branding', { logoUrl: '' });
  return { logoUrl: typeof branding.logoUrl === 'string' ? branding.logoUrl : '' };
});

// Informations d'aide, lues dans les réglages : contacts (wy_settings/support), dépôt (payments), bonus et parrainage.
// Rien n'est écrit en dur dans l'application : tout ce qui est réglable dans l'admin vient d'ici.
// Accessible sans connexion : seules des informations publiques sont renvoyées (contacts, minimums, bonus publics).
exports.getHelpInfo = onCall({ region: REGION }, async () => {
  const support = await gameSettings('support', { email: '', whatsapp: '', telegram: '', hours: '', helpline: '' });
  const payments = await gameSettings('payments', { minDepositXof: 1000, expiryMinutes: 30 });
  const welcome = await gameSettings('welcome-bonus', { enabled: false, amountXof: 0 });
  const rates = await referralRates();
  return {
    support: {
      email: support.email || '',
      whatsapp: support.whatsapp || '',
      telegram: support.telegram || '',
      hours: support.hours || '',
      helpline: support.helpline || '',
    },
    deposit: {
      minDepositXof: payments.minDepositXof ?? 1000,
      expiryMinutes: payments.expiryMinutes ?? 30,
    },
    welcomeBonus: { enabled: welcome.enabled === true, amountXof: Number(welcome.amountXof) || 0 },
    referralRates: rates,
  };
});

// Lucky Spin : débite la mise, tire une case, crédite le gain et enregistre le pari.
// La mise est prise sur le solde des dépôts, puis sur le bonus. Le gain suit la même répartition.
exports.playLuckySpin = onCall({ region: REGION }, async (request) => {
  await assertNotSuspended(request);
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
      result: payout > stake ? 'won' : 'lost',
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
  await assertNotSuspended(request);
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
      result: payout > stake ? 'won' : 'lost',
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
      tx.update(doc.ref, { status: 'settled', matches, payout, result: payout > bet.stake ? 'won' : 'lost', settledAt: FieldValue.serverTimestamp() });
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
  await assertNotSuspended(request);
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
  const jackpotSettings = await db.collection('wy_settings').doc('jackpot').get();
  const { winnerCount } = parseJackpotConfig(jackpotSettings.data());
  const pot = Math.floor(round.pot || 0);

  const winners = await drawJackpotWinners(current.id, round.ticketsCount || 0, winnerCount);
  const shares = splitJackpot(pot, winners);
  for (const share of shares) {
    if (share.prize > 0) {
      await db.collection('wy_users').doc(share.uid).update({ 'balance.real': FieldValue.increment(share.prize) });
    }
  }
  const winnerName = shares.map((share) => share.name).join(', ');

  await roundRef.update({
    status: 'closed',
    winners: shares.map((share) => ({ uid: share.uid, name: share.name, tickets: share.tickets, prize: share.prize })),
    winnerUid: shares[0] ? shares[0].uid : null,
    winnerName,
    prize: shares.length ? pot : 0,
  });

  const settingsRef = db.collection('wy_settings').doc('jackpot');
  const settings = await settingsRef.get();
  const previous = settings.exists ? settings.get('recentWinners') || [] : [];
  const recentWinners = shares.length
    ? [{ roundId: current.id, winnerName, prize: pot, closedAt: Date.now() }, ...previous].slice(0, JACKPOT.recentWinnersKept)
    : previous;
  await settingsRef.set({ lastDrawAt: current.drawAt, recentWinners }, { merge: true });

  await ensureOpenJackpotRound();
  return { roundId: current.id, prize: shares.length ? pot : 0, winnerName };
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
  await assertNotSuspended(request);
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
      tx.update(doc.ref, { status: won ? 'cashed' : 'lost', result: won ? 'won' : 'lost', multiplier, payout, settledAt: FieldValue.serverTimestamp() });
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
  await assertNotSuspended(request);
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
  await assertNotSuspended(request);
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
    tx.update(betRef, { status: 'cashed', result: 'won', multiplier, payout, settledAt: FieldValue.serverTimestamp() });

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

// Compétitions activées par l'admin (wy_sport_leagues, enabled = true). Seules celles-là sont importées.
async function enabledSportLeagues() {
  const snapshot = await db.collection('wy_sport_leagues').where('enabled', '==', true).get();
  return snapshot.docs.map((doc) => ({ key: doc.id, title: doc.get('title') || doc.id }));
}

// Import des cotes Sport toutes les 3 heures (The Odds API), pour les compétitions activées.
exports.sportOddsImportScheduled = onSchedule(
  { schedule: 'every 3 hours', region: REGION, secrets: [oddsApiKey] },
  async () => {
    await runSportOddsImport(db, oddsApiKey.value(), Date.now(), await enabledSportLeagues());
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

// Passage en direct : toutes les 5 minutes, les matchs à venir dont le coup d'envoi est passé deviennent « en direct ».
// Coût minimal : une requête indexée (statut + heure), limitée à 100 matchs, sans appel à l'API externe et sans crédit consommé.
// Rien n'est écrit quand aucun match n'a commencé. Les paris restent bloqués au coup d'envoi (vérification sur l'heure).
exports.sportLiveScheduled = onSchedule({ schedule: 'every 5 minutes', region: REGION }, async () => {
  const started = await db
    .collection('wy_sport_events')
    .where('status', '==', 'upcoming')
    .where('commenceTime', '<=', Timestamp.fromMillis(Date.now()))
    .limit(100)
    .get();
  if (started.empty) return;
  const batch = db.batch();
  started.forEach((doc) => batch.update(doc.ref, { status: 'live', liveAt: FieldValue.serverTimestamp() }));
  await batch.commit();
  console.info('[sport] passage en direct', { count: started.size });
});

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
  return runSportOddsImport(db, oddsApiKey.value(), Date.now(), await enabledSportLeagues());
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
  await assertNotSuspended(request);
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
    // Compétition masquée ou absente du catalogue : pas de pari. Les matchs ajoutés à la main restent pariables.
    const sportKeys = [...new Set(eventSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => snapshot.get('sportKey'))
      .filter((key) => key && key !== 'manual'))];
    const leagueSnapshots = await Promise.all(sportKeys.map((key) => tx.get(db.collection('wy_sport_leagues').doc(key))));
    if (leagueSnapshots.some((snapshot) => snapshot.get('visible') !== true)) {
      throw new HttpsError('failed-precondition', 'Cette compétition n’est pas disponible.');
    }
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
  await assertNotSuspended(request);
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
  const welcome = await gameSettings('welcome-bonus', { enabled: false, amountXof: 0 });
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

    // Bonus de bienvenue : une seule fois par compte, au premier dépôt confirmé (le compte devient vérifié).
    const welcomeAmount = welcome.enabled && Number(welcome.amountXof) > 0 && !userSnap.get('welcomeBonusAt')
      ? Math.floor(Number(welcome.amountXof))
      : 0;
    const depositDocRef = db.collection('wy_deposits').doc();
    const userUpdate = { 'balance.real': FieldValue.increment(amount), verified: true };
    if (welcomeAmount > 0) {
      userUpdate['balance.bonus'] = FieldValue.increment(welcomeAmount);
      userUpdate.welcomeBonusAt = FieldValue.serverTimestamp();
      userUpdate.welcomeBonusAmount = welcomeAmount;
      tx.set(db.collection('wy_settings').doc('welcome-bonus-stats'), {
        grantedCount: FieldValue.increment(1),
        grantedTotal: FieldValue.increment(welcomeAmount),
      }, { merge: true });
    }
    tx.update(userRef, userUpdate);
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

// Administration : statistiques du bonus de bienvenue (lecture seule).
exports.adminGetWelcomeBonusStats = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request);
  const snapshot = await db.collection('wy_settings').doc('welcome-bonus-stats').get();
  return {
    grantedCount: snapshot.get('grantedCount') || 0,
    grantedTotal: snapshot.get('grantedTotal') || 0,
  };
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
      const field = source.orderField || 'createdAt';
      query = query.orderBy(field, 'desc');
      if (cursor) query = query.where(field, '<=', Timestamp.fromMillis(cursor.createdAt));
      const snapshot = await query.limit(pageSize + 1).get();
      return snapshot.docs.map((doc) => ({
        key: `${source.key}:${doc.id}`,
        createdAt: doc.get(field)?.toMillis?.() || 0,
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
      suspended: user.suspended === true,
      suspendedReason: user.suspendedReason || '',
      balanceReal: user.balance?.real || 0,
      balanceBonus: user.balance?.bonus || 0,
      createdAt: user.createdAt ? user.createdAt.toMillis() : 0,
    },
  };
});

// Administration : matchs et cotes importés (lecture seule), par pages. Tri : date du match, la plus récente d'abord.
const SPORT_STATUSES = ['upcoming', 'live', 'finished', 'cancelled', 'suspended'];

exports.adminListSportEvents = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request);
  const pageSize = adminPageSize(request.data?.pageSize);
  const cursor = parseAdminCursor(request.data?.cursor);
  const status = request.data?.status;
  const statusFilter = SPORT_STATUSES.includes(status) ? [['status', '==', status]] : [];

  const oddsOf = (value) => (value ? { home: value.home ?? null, draw: value.draw ?? null, away: value.away ?? null, over: value.over ?? null, under: value.under ?? null } : null);
  const { rows, next } = await pageAcrossCollections(
    [{
      key: 'e',
      collection: 'wy_sport_events',
      filters: statusFilter,
      orderField: 'commenceTime',
      map: (doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          league: d.league || '',
          homeTeam: d.homeTeam || '',
          awayTeam: d.awayTeam || '',
          status: d.status || '—',
          commenceTime: d.commenceTime ? d.commenceTime.toMillis() : 0,
          odds: oddsOf(d.odds),
          oddsSource: d.oddsSource || '',
          manualOdds: d.manualOdds === true,
          manual: d.manual === true,
          oddsUpdatedAt: d.oddsUpdatedAt ? d.oddsUpdatedAt.toMillis() : 0,
        };
      },
    }],
    cursor,
    pageSize
  );
  return { events: rows, next };
});

// Administration : paris de tous les jeux, du plus récent au plus ancien, par pages (lecture seule).
const BET_STATUSES = ['open', 'won', 'lost', 'void', 'cashed', 'settled'];
const BET_GAMES = ['lucky-spin', 'mystery-box', 'lucky-number', 'jackpot', 'crash', 'sport'];

exports.adminListBets = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request);
  const pageSize = adminPageSize(request.data?.pageSize);
  const cursor = parseAdminCursor(request.data?.cursor);
  const status = request.data?.status;
  const game = request.data?.game;
  const filters = [];
  if (BET_STATUSES.includes(status)) filters.push(['status', '==', status]);
  if (BET_GAMES.includes(game)) filters.push(['game', '==', game]);

  const GAME_LABELS = { 'lucky-spin': 'Lucky Spin', 'mystery-box': 'Mystery Box', 'lucky-number': 'Lucky Number', jackpot: 'Jackpot', crash: 'Crash', sport: 'Sport' };
  const MODE_LABELS = { single: 'simple', combo: 'combiné' };
  const { rows, next } = await pageAcrossCollections(
    [{
      key: 'b',
      collection: 'wy_bets',
      filters,
      map: (doc) => {
        const d = doc.data();
        const detail = d.game === 'sport' && d.mode ? `${GAME_LABELS.sport} · ${MODE_LABELS[d.mode] || d.mode}` : GAME_LABELS[d.game] || d.game || '';
        return {
          id: doc.id,
          uid: d.uid || '',
          game: detail,
          stake: d.stake || 0,
          status: d.status || '—',
          payout: typeof d.payout === 'number' ? d.payout : null,
          createdAt: d.createdAt ? d.createdAt.toMillis() : 0,
          settledAt: d.settledAt ? d.settledAt.toMillis() : 0,
        };
      },
    }],
    cursor,
    pageSize
  );
  return { bets: rows, next };
});

// Administration : gestion des administrateurs (réservée au super administrateur). Chaque changement est journalisé.
const ROLE_CHOICES = ['super_admin', 'finance', 'support', 'trader'];

exports.adminListAdmins = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request, ['super_admin']);
  const snapshot = await db.collection('wy_admins').limit(100).get();
  const profiles = await Promise.all(snapshot.docs.map((doc) => db.collection('wy_users').doc(doc.id).get()));
  return {
    admins: snapshot.docs.map((doc, index) => ({
      uid: doc.id,
      role: doc.get('role') || '',
      fullName: profiles[index].get('fullName') || '',
      email: profiles[index].get('email') || '',
    })),
  };
});

// Donner, changer ou retirer (role = 'none') le rôle d'un administrateur. Le compte doit déjà exister comme joueur.
exports.adminSetAdminRole = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(db, request, ['super_admin']);
  const uid = request.data?.uid;
  const role = request.data?.role;
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Compte invalide.');
  if (role !== 'none' && !ROLE_CHOICES.includes(role)) throw new HttpsError('invalid-argument', 'Rôle inconnu.');
  if (uid === admin.uid) throw new HttpsError('failed-precondition', 'Vous ne pouvez pas modifier votre propre rôle.');

  const userSnap = await db.collection('wy_users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'Ce compte n’existe pas.');

  const ref = db.collection('wy_admins').doc(uid);
  const before = (await ref.get()).get('role') || null;
  const after = role === 'none' ? null : role;
  if (before === after) return { ok: true };

  if (before === 'super_admin' && after !== 'super_admin') {
    const supers = await db.collection('wy_admins').where('role', '==', 'super_admin').limit(2).get();
    if (supers.size < 2) {
      throw new HttpsError('failed-precondition', 'Il doit rester au moins un super administrateur.');
    }
  }

  if (after === null) {
    await ref.delete();
  } else {
    await ref.set({ role: after, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await db.collection('wy_audit_log').add({
    uid: admin.uid,
    role: admin.role,
    action: 'admin.role',
    target: uid,
    before,
    after,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

// Administration : bonus de parrainage versés, les plus récents d'abord, par pages. Filtre par niveau (1 à 5).
exports.adminListReferralBonuses = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request);
  const pageSize = adminPageSize(request.data?.pageSize);
  const cursor = parseAdminCursor(request.data?.cursor);
  const level = Number(request.data?.level);
  const filters = Number.isInteger(level) && level >= 1 && level <= MAX_REFERRAL_LEVELS ? [['level', '==', level]] : [];
  const { rows, next } = await pageAcrossCollections(
    [{
      key: 'r',
      collection: 'wy_referral_bonuses',
      filters,
      map: (doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          referrerId: d.referrerId || '',
          referredId: d.referredId || '',
          level: d.level || 0,
          amount: d.amount || 0,
          createdAt: d.createdAt ? d.createdAt.toMillis() : 0,
        };
      },
    }],
    cursor,
    pageSize
  );
  return { bonuses: rows, next };
});

// Administration : rapport d'activité sur une période (aujourd'hui, 7 ou 30 jours, en UTC).
// Calculé par requêtes d'agrégation (compte et somme) : on ne lit pas chaque document.
const REPORT_PERIODS = { today: 1, '7d': 7, '30d': 30 };

exports.adminGetReports = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(db, request);
  const period = request.data?.period;
  console.info('[rapports] demande', { uid: admin.uid, period });
  if (!Object.prototype.hasOwnProperty.call(REPORT_PERIODS, period)) {
    throw new HttpsError('invalid-argument', 'Période inconnue.');
  }
  const { AggregateField } = require('firebase-admin/firestore');
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (REPORT_PERIODS[period] - 1));
  const since = Timestamp.fromDate(start);

  // Une requête par somme : chacune utilise un index (date + champ) déjà déployé.
  const [users, deposits, betsStake, betsPayout, bonuses] = await Promise.all([
    db.collection('wy_users').where('createdAt', '>=', since).count().get(),
    db.collection('wy_deposits').where('createdAt', '>=', since).aggregate({
      count: AggregateField.count(),
      total: AggregateField.sum('amount'),
    }).get(),
    db.collection('wy_bets').where('createdAt', '>=', since).aggregate({
      count: AggregateField.count(),
      stake: AggregateField.sum('stake'),
    }).get(),
    db.collection('wy_bets').where('createdAt', '>=', since).aggregate({
      payout: AggregateField.sum('payout'),
    }).get(),
    db.collection('wy_referral_bonuses').where('createdAt', '>=', since).aggregate({
      total: AggregateField.sum('amount'),
    }).get(),
  ]).catch((err) => {
    // Trace serveur : qui, quelle période, quelle erreur. Le motif est renvoyé à l'écran admin.
    console.error('[rapports] calcul impossible', { uid: admin.uid, period, code: err?.code, message: err?.message });
    throw new HttpsError('internal', `Calcul des rapports impossible (${err?.code ?? 'erreur'}). Voir les journaux de la fonction.`);
  });

  const depositData = deposits.data();
  const betData = betsStake.data();
  const stake = betData.stake || 0;
  const payout = betsPayout.data().payout || 0;
  return {
    period,
    since: start.getTime(),
    newPlayers: users.data().count,
    deposits: { count: depositData.count || 0, total: depositData.total || 0 },
    bets: { count: betData.count || 0, stake, payout },
    referralBonuses: bonuses.data().total || 0,
    // Marge : part des mises qui reste à la plateforme (mises − gains), en pourcentage.
    margin: stake > 0 ? Math.round(((stake - payout) / stake) * 1000) / 10 : null,
  };
});

// Administration : catalogue des compétitions de tous les sports (The Odds API). Les vainqueurs finaux sont exclus.
// Seules les compétitions de football peuvent être activées pour l'import (les autres sports n'ont pas encore de logique de cotes).
// Une nouvelle compétition arrive désactivée, sauf la Ligue 1 (déjà suivie). Les réglages de l'admin sont conservés.
const SPORT_LEAGUE_ROLES = ['super_admin', 'trader'];

exports.adminSyncSportCatalog = onCall({ region: REGION, secrets: [oddsApiKey] }, async (request) => {
  const admin = await requireAdmin(db, request, SPORT_LEAGUE_ROLES);
  const response = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(oddsApiKey.value())}`);
  if (!response.ok) throw new HttpsError('unavailable', `The Odds API : HTTP ${response.status}`);
  const sports = await response.json();
  const football = sports.filter((sport) => sport.has_outrights !== true);

  const refs = football.map((sport) => db.collection('wy_sport_leagues').doc(sport.key));
  const existing = refs.length ? await db.getAll(...refs) : [];
  const batch = db.batch();
  football.forEach((sport, index) => {
    const isNew = !existing[index].exists;
    const starter = isNew && sport.key === 'soccer_france_ligue_one';
    batch.set(
      refs[index],
      {
        key: sport.key,
        title: sport.title,
        description: sport.description || '',
        group: sport.group,
        ...(isNew ? { enabled: starter, visible: starter } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  await batch.commit();
  await db.collection('wy_audit_log').add({
    uid: admin.uid,
    role: admin.role,
    action: 'sport.catalog.sync',
    count: football.length,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, count: football.length };
});

// Sports dont l'import des cotes est prêt. Les autres sont au catalogue, mais ne peuvent pas être activés.
const IMPORTABLE_GROUPS = ['Soccer'];

exports.adminListSportLeagues = onCall({ region: REGION }, async (request) => {
  await requireAdmin(db, request);
  const snapshot = await db.collection('wy_sport_leagues').limit(200).get();
  const leagues = snapshot.docs
    .map((doc) => ({
      key: doc.id,
      title: doc.get('title') || doc.id,
      group: doc.get('group') || '',
      enabled: doc.get('enabled') === true,
      visible: doc.get('visible') === true,
      importable: IMPORTABLE_GROUPS.includes(doc.get('group')),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  return { leagues };
});

exports.adminSetSportLeague = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(db, request, SPORT_LEAGUE_ROLES);
  const key = request.data?.key;
  if (typeof key !== 'string' || !key) throw new HttpsError('invalid-argument', 'Compétition invalide.');
  const ref = db.collection('wy_sport_leagues').doc(key);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Compétition introuvable : mettez d’abord le catalogue à jour.');
  const changes = {};
  for (const field of ['enabled', 'visible']) {
    if (request.data?.[field] !== undefined) {
      if (typeof request.data[field] !== 'boolean') throw new HttpsError('invalid-argument', 'Valeur invalide.');
      changes[field] = request.data[field];
    }
  }
  if (Object.keys(changes).length === 0) throw new HttpsError('invalid-argument', 'Rien à modifier.');
  if (changes.enabled === true && !IMPORTABLE_GROUPS.includes(snapshot.get('group'))) {
    throw new HttpsError('failed-precondition', 'Ce sport n’est pas encore disponible pour l’import.');
  }
  await ref.update({ ...changes, updatedAt: FieldValue.serverTimestamp() });
  await db.collection('wy_audit_log').add({
    uid: admin.uid,
    role: admin.role,
    action: 'sport.league',
    target: key,
    before: { enabled: snapshot.get('enabled') === true, visible: snapshot.get('visible') === true },
    after: changes,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

// Administration : actions sur un match. Suspendre, réactiver, annuler (les paris du match sont remboursés
// tout de suite), saisir des cotes à la main, ou revenir aux cotes automatiques. Chaque action est journalisée.
const SPORT_ADMIN_ROLES = ['super_admin', 'trader'];
const ODDS_KEYS = ['home', 'draw', 'away', 'over', 'under'];

exports.adminSetSportEvent = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(db, request, SPORT_ADMIN_ROLES);
  const eventId = request.data?.eventId;
  const action = request.data?.action;
  if (typeof eventId !== 'string' || !eventId) throw new HttpsError('invalid-argument', 'Match invalide.');
  const ref = db.collection('wy_sport_events').doc(eventId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Match introuvable.');
  const event = snapshot.data();
  const status = event.status;
  const log = (entry) => db.collection('wy_audit_log').add({
    uid: admin.uid,
    role: admin.role,
    target: eventId,
    createdAt: FieldValue.serverTimestamp(),
    ...entry,
  });

  if (action === 'suspend') {
    if (status !== 'upcoming') throw new HttpsError('failed-precondition', 'Seul un match à venir peut être suspendu.');
    const reason = reasonOrThrow(request.data?.reason);
    await ref.update({ status: 'suspended' });
    await log({ action: 'sport.suspend', reason });
    return { ok: true, status: 'suspended' };
  }

  if (action === 'reopen') {
    if (status !== 'suspended') throw new HttpsError('failed-precondition', 'Seul un match suspendu peut être réactivé.');
    if (event.commenceTime.toMillis() <= Date.now()) {
      throw new HttpsError('failed-precondition', 'Le match a déjà commencé.');
    }
    await ref.update({ status: 'upcoming' });
    await log({ action: 'sport.reopen' });
    return { ok: true, status: 'upcoming' };
  }

  if (action === 'cancel') {
    if (!['upcoming', 'suspended'].includes(status)) {
      throw new HttpsError('failed-precondition', 'Ce match ne peut plus être annulé.');
    }
    const reason = reasonOrThrow(request.data?.reason);
    await ref.update({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() });
    // Chaque choix de ce match compte comme remboursé ; les paris qui n'ont plus d'autre match en attente sont réglés.
    const refundedBets = await settleEventBets(db, eventId);
    await log({ action: 'sport.cancel', reason, refundedBets });
    return { ok: true, status: 'cancelled', refundedBets };
  }

  if (action === 'setOdds') {
    if (status !== 'upcoming') {
      throw new HttpsError('failed-precondition', 'Les cotes ne peuvent être saisies que pour un match à venir.');
    }
    const input = request.data?.odds || {};
    const valid = ODDS_KEYS.every((key) => typeof input[key] === 'number' && Number.isFinite(input[key]) && input[key] >= 1.01 && input[key] <= 1000);
    if (!valid) throw new HttpsError('invalid-argument', 'Chaque cote doit être comprise entre 1,01 et 1000.');
    const odds = {
      ...(event.odds || {}),
      ...Object.fromEntries(ODDS_KEYS.map((key) => [key, Math.round(input[key] * 100) / 100])),
    };
    await ref.update({ odds, manualOdds: true, oddsSource: 'manual', oddsUpdatedAt: FieldValue.serverTimestamp() });
    await log({ action: 'sport.odds', after: odds });
    return { ok: true };
  }

  if (action === 'setResult') {
    if (event.manual !== true) throw new HttpsError('failed-precondition', 'Seul un match ajouté à la main reçoit un résultat saisi.');
    if (['finished', 'cancelled'].includes(status)) throw new HttpsError('failed-precondition', 'Ce match est déjà réglé ou annulé.');
    if (event.commenceTime.toMillis() > Date.now()) throw new HttpsError('failed-precondition', 'Le match n’a pas encore commencé.');
    const homeScore = request.data?.homeScore;
    const awayScore = request.data?.awayScore;
    const isScore = (value) => Number.isInteger(value) && value >= 0 && value <= 99;
    if (!isScore(homeScore) || !isScore(awayScore)) throw new HttpsError('invalid-argument', 'Scores invalides (entiers de 0 à 99).');
    const totalLine = event.odds?.line ?? 2.5;
    await ref.update({
      status: 'finished',
      result: { homeScore, awayScore, totalLine },
      finishedAt: FieldValue.serverTimestamp(),
    });
    const settledBets = await settleEventBets(db, eventId);
    await log({ action: 'sport.result', after: { homeScore, awayScore }, settledBets });
    return { ok: true, settledBets };
  }

  if (action === 'clearOdds') {
    // Les cotes automatiques reviennent au prochain import (toutes les 3 heures).
    await ref.update({ manualOdds: false, oddsSource: 'api' });
    await log({ action: 'sport.odds.clear' });
    return { ok: true };
  }

  throw new HttpsError('invalid-argument', 'Action inconnue.');
});

// Administration : ajout d'un match à la main (cotes saisies par l'admin, résultat saisi après le match).
exports.adminCreateSportEvent = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(db, request, SPORT_ADMIN_ROLES);
  const text = (value, min, max) => {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (clean.length < min || clean.length > max) throw new HttpsError('invalid-argument', `Texte invalide (${min} à ${max} caractères).`);
    return clean;
  };
  const league = text(request.data?.league, 2, 60);
  const homeTeam = text(request.data?.homeTeam, 2, 60);
  const awayTeam = text(request.data?.awayTeam, 2, 60);
  if (homeTeam.toLowerCase() === awayTeam.toLowerCase()) throw new HttpsError('invalid-argument', 'Les deux équipes doivent être différentes.');
  const commenceMs = Number(request.data?.commenceTimeMs);
  if (!Number.isFinite(commenceMs) || commenceMs <= Date.now() + 10 * 60 * 1000) {
    throw new HttpsError('invalid-argument', 'Le coup d’envoi doit être dans plus de 10 minutes.');
  }
  const input = request.data?.odds || {};
  const valid = ODDS_KEYS.every((key) => typeof input[key] === 'number' && Number.isFinite(input[key]) && input[key] >= 1.01 && input[key] <= 1000);
  if (!valid) throw new HttpsError('invalid-argument', 'Chaque cote doit être comprise entre 1,01 et 1000.');
  const odds = { ...Object.fromEntries(ODDS_KEYS.map((key) => [key, Math.round(input[key] * 100) / 100])), line: 2.5 };

  const ref = db.collection('wy_sport_events').doc();
  await ref.set({
    manual: true,
    sportKey: 'manual',
    league,
    homeTeam,
    awayTeam,
    commenceTime: Timestamp.fromMillis(commenceMs),
    status: 'upcoming',
    odds,
    oddsSource: 'manual',
    manualOdds: true,
    oddsUpdatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.collection('wy_audit_log').add({
    uid: admin.uid,
    role: admin.role,
    action: 'sport.create',
    target: ref.id,
    after: { league, homeTeam, awayTeam, commenceMs, odds },
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, id: ref.id };
});

// Suspension : un compte suspendu ne peut plus jouer, parier ni déposer. Contrôlé côté serveur à chaque action d'argent.
async function assertNotSuspended(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const snapshot = await db.collection('wy_users').doc(request.auth.uid).get();
  if (snapshot.get('suspended') === true) {
    throw new HttpsError('permission-denied', 'Ce compte est suspendu. Contactez le support.');
  }
}

const SUSPEND_ROLES = ['super_admin', 'support'];
const BALANCE_ROLES = ['super_admin', 'finance'];
const MAX_BALANCE_ADJUSTMENT = 1000000;

function reasonOrThrow(value) {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 3 || reason.length > 200) {
    throw new HttpsError('invalid-argument', 'Indiquez un motif (3 à 200 caractères).');
  }
  return reason;
}

// Suspendre ou réactiver un joueur. Action journalisée.
exports.adminSetSuspended = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(db, request, SUSPEND_ROLES);
  const uid = request.data?.uid;
  const suspended = request.data?.suspended;
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Joueur invalide.');
  if (typeof suspended !== 'boolean') throw new HttpsError('invalid-argument', 'Action invalide.');
  const reason = reasonOrThrow(request.data?.reason);

  const ref = db.collection('wy_users').doc(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Joueur introuvable.');
  await ref.update({
    suspended,
    suspendedReason: suspended ? reason : null,
    suspendedAt: suspended ? FieldValue.serverTimestamp() : null,
  });
  await db.collection('wy_audit_log').add({
    uid: admin.uid,
    role: admin.role,
    action: suspended ? 'user.suspend' : 'user.unsuspend',
    target: uid,
    reason,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

// Ajustement manuel d'un solde (réel ou bonus). Positif = crédit, négatif = débit. Le solde ne peut pas devenir négatif.
exports.adminAdjustBalance = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(db, request, BALANCE_ROLES);
  const uid = request.data?.uid;
  const bucket = request.data?.bucket;
  const amount = request.data?.amount;
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Joueur invalide.');
  if (bucket !== 'real' && bucket !== 'bonus') throw new HttpsError('invalid-argument', 'Solde invalide.');
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_BALANCE_ADJUSTMENT) {
    throw new HttpsError('invalid-argument', 'Montant invalide : entier non nul, 1 000 000 FCFA au maximum.');
  }
  const reason = reasonOrThrow(request.data?.reason);

  const ref = db.collection('wy_users').doc(uid);
  const field = `balance.${bucket}`;
  const { before, after } = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Joueur introuvable.');
    const current = snapshot.get(field) || 0;
    const next = current + amount;
    if (next < 0) {
      throw new HttpsError('failed-precondition', `Solde insuffisant : ${current} FCFA disponibles.`);
    }
    tx.update(ref, { [field]: FieldValue.increment(amount) });
    return { before: current, after: next };
  });

  await db.collection('wy_audit_log').add({
    uid: admin.uid,
    role: admin.role,
    action: 'balance.adjust',
    target: uid,
    bucket,
    amount,
    before,
    after,
    reason,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, balance: after };
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
