// Administration : rôles, réglages modifiables et journal d'audit.
// Un compte est administrateur si un document wy_admins/{uid} existe, avec un champ role.
const { HttpsError } = require('firebase-functions/v2/https');

const ROLES = ['super_admin', 'finance', 'support', 'trader'];

// Rôles autorisés à modifier chaque réglage.
const SETTINGS = {
  payments: { roles: ['super_admin', 'finance'] },
  'lucky-spin': { roles: ['super_admin'] },
  'mystery-box': { roles: ['super_admin'] },
  'lucky-number': { roles: ['super_admin'] },
  jackpot: { roles: ['super_admin'] },
  crash: { roles: ['super_admin'] },
  referral: { roles: ['super_admin', 'finance'] },
  'welcome-bonus': { roles: ['super_admin', 'finance'] },
  support: { roles: ['super_admin', 'support'] },
  home: { roles: ['super_admin', 'support'] },
  branding: { roles: ['super_admin', 'support'] },
};

// Destinations proposées pour les boutons du héros (visiteur et connecté).
const HOME_TARGETS = ['register', 'login', 'games', 'sport', 'home', 'bonus'];
// Badges optionnels d'une carte de jeu (vide = aucun badge).
const HOME_GAME_BADGES = ['Nouveau', 'Populaire'];
const IMAGE_URL = /^https:\/\/[^\s"'()<>]+$/;

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isNum = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// Contrôle de chaque valeur : renvoie un message d'erreur lisible, ou null.
const VALIDATORS = {
  payments: (v) => {
    if (!ADDRESS.test(v.adminAddress || '')) return "L'adresse de réception doit être une adresse 0x valide.";
    if (!isNum(v.rateXofPerUsd, 1, 10000)) return 'Le taux doit être compris entre 1 et 10 000 FCFA par dollar.';
    if (!isInt(v.minDepositXof, 1, 10000000)) return 'Le minimum de dépôt doit être un nombre entier de FCFA.';
    if (!isInt(v.expiryMinutes, 5, 240)) return 'La durée de validité doit être comprise entre 5 et 240 minutes.';
    return null;
  },
  'lucky-spin': (v) => {
    if (!isInt(v.minStake, 1, 1000000) || !isInt(v.maxStake, 1, 1000000) || v.minStake > v.maxStake) return 'Mises invalides (minimum ≤ maximum).';
    if (!Array.isArray(v.segments) || v.segments.length !== 8) return 'La roue doit avoir exactement 8 cases.';
    if (v.segments.some((s) => !isNum(s.multiplier, 0, 1000) || !isInt(s.weight, 0, 1000000))) return 'Chaque case doit avoir un multiplicateur et un poids valides.';
    if (v.segments.reduce((sum, s) => sum + s.weight, 0) <= 0) return 'Les poids de la roue ne peuvent pas tous être nuls.';
    return null;
  },
  'mystery-box': (v) => {
    if (!isInt(v.minStake, 1, 1000000) || !isInt(v.maxStake, 1, 1000000) || v.minStake > v.maxStake) return 'Mises invalides (minimum ≤ maximum).';
    if (!Array.isArray(v.outcomes) || v.outcomes.length === 0) return 'Il faut au moins une issue.';
    if (v.outcomes.some((o) => !isNum(o.multiplier, 0, 1000) || !isInt(o.weight, 0, 1000000))) return 'Chaque issue doit avoir un multiplicateur et un poids valides.';
    return null;
  },
  'lucky-number': (v) => {
    if (!isInt(v.minStake, 1, 1000000) || !isInt(v.maxStake, 1, 1000000) || v.minStake > v.maxStake) return 'Mises invalides (minimum ≤ maximum).';
    if (!isInt(v.jackpotAmount, 0, 100000000)) return 'Le gros lot doit être un nombre entier de FCFA.';
    if (!v.multipliers || typeof v.multipliers !== 'object') return 'Les multiplicateurs sont invalides.';
    if (Object.values(v.multipliers).some((m) => !isNum(m, 0, 10000))) return 'Chaque multiplicateur doit être compris entre 0 et 10 000.';
    return null;
  },
  jackpot: (v) => {
    if (!isInt(v.ticketPrice, 1, 1000000)) return 'Le prix du ticket doit être un nombre entier de FCFA.';
    if (!isNum(v.potShare, 0.01, 1)) return 'La part vers la cagnotte doit être comprise entre 1 % et 100 %.';
    if (!isInt(v.winnerCount, 1, 10)) return 'Le nombre de gagnants doit être compris entre 1 et 10.';
    return null;
  },
  'welcome-bonus': (v) => {
    if (typeof v.enabled !== 'boolean') return 'Le champ « activé » doit être oui ou non.';
    if (!isInt(v.amountXof, 0, 1000000)) return 'Le montant du bonus doit être un nombre entier de FCFA (1 000 000 maximum).';
    return null;
  },
  home: (v) => {
    if (!Array.isArray(v.sideCards) || v.sideCards.length !== 2) return 'Il faut exactement 2 cartes à droite du héros.';
    for (const card of v.sideCards) {
      if (typeof card.title !== 'string' || card.title.trim().length === 0 || card.title.length > 40) return 'Titre de carte invalide (40 caractères).';
      if (typeof card.subtitle !== 'string' || card.subtitle.length > 80) return 'Sous-titre trop long (80 caractères).';
      if (typeof card.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(card.color)) return 'Couleur de fond invalide.';
      if (!HOME_TARGETS.includes(card.target)) return 'Destination de carte inconnue.';
      if (card.imageUrl && (typeof card.imageUrl !== 'string' || !IMAGE_URL.test(card.imageUrl) || card.imageUrl.length > 500)) {
        return "L'image doit être une adresse https valide.";
      }
    }
    if (!Array.isArray(v.slides) || v.slides.length < 1 || v.slides.length > 5) return 'Il faut entre 1 et 5 slides.';
    for (const slide of v.slides) {
      for (const key of ['kicker', 'title', 'text', 'ctaLabel', 'userCtaLabel']) {
        if (typeof slide[key] !== 'string' || slide[key].trim().length === 0) return 'Chaque slide doit avoir des textes et des libellés de bouton.';
      }
      if (slide.kicker.length > 40 || slide.title.length > 80 || slide.text.length > 200) return 'Textes trop longs (titre 80, accroche 40, texte 200 caractères).';
      if (slide.ctaLabel.length > 30 || slide.userCtaLabel.length > 30) return 'Libellés de bouton trop longs (30 caractères).';
      if (!HOME_TARGETS.includes(slide.ctaTarget) || !HOME_TARGETS.includes(slide.userCtaTarget)) return 'Destination de bouton inconnue.';
      if (slide.imageUrl && (typeof slide.imageUrl !== 'string' || !IMAGE_URL.test(slide.imageUrl) || slide.imageUrl.length > 500)) {
        return "L'image doit être une adresse https valide.";
      }
    }
    if (v.games !== undefined) {
      if (!Array.isArray(v.games) || v.games.length < 1 || v.games.length > 10) return 'Il faut entre 1 et 10 jeux.';
      for (const game of v.games) {
        if (typeof game.name !== 'string' || game.name.trim().length === 0 || game.name.length > 30) return 'Nom de jeu invalide (30 caractères).';
        if (typeof game.desc !== 'string' || game.desc.length > 60) return 'Description de jeu trop longue (60 caractères).';
        if (typeof game.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(game.color)) return 'Couleur de jeu invalide.';
        if (!HOME_TARGETS.includes(game.target)) return 'Destination de jeu inconnue.';
        if (game.badge !== undefined && game.badge !== '' && !HOME_GAME_BADGES.includes(game.badge)) return 'Badge de jeu inconnu.';
        if (game.imageUrl && (typeof game.imageUrl !== 'string' || !IMAGE_URL.test(game.imageUrl) || game.imageUrl.length > 500)) {
          return "L'image de jeu doit être une adresse https valide.";
        }
      }
    }
    return null;
  },
  branding: (v) => {
    if (v.logoUrl && (typeof v.logoUrl !== 'string' || !IMAGE_URL.test(v.logoUrl) || v.logoUrl.length > 500)) {
      return "Le logo doit être une adresse https valide.";
    }
    return null;
  },
  support: (v) => {
    for (const key of ['email', 'whatsapp', 'telegram', 'hours', 'helpline']) {
      if (typeof v[key] !== 'string' || v[key].length > 200) return 'Un champ de contact est invalide (200 caractères au maximum).';
    }
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) return "L'adresse e-mail n'est pas valide.";
    return null;
  },
  referral: (v) => {
    if (!Array.isArray(v.rates) || v.rates.length !== 5) return 'Il faut exactement 5 taux (un par niveau).';
    if (v.rates.some((r) => !isNum(r, 0, 100))) return 'Chaque taux doit être compris entre 0 et 100 %.';
    if (v.rates.reduce((sum, r) => sum + r, 0) > 100) return 'La somme des taux ne peut pas dépasser 100 % du dépôt.';
    return null;
  },
  crash: (v) => {
    if (typeof v.enabled !== 'boolean') return 'Le champ « activé » doit être oui ou non.';
    if (!isInt(v.minStake, 1, 1000000) || !isInt(v.maxStake, 1, 1000000) || v.minStake > v.maxStake) return 'Mises invalides (minimum ≤ maximum).';
    if (!isInt(v.bettingSeconds, 3, 60)) return 'La phase de mise doit durer entre 3 et 60 secondes.';
    if (!isNum(v.growthRate, 0.01, 0.2)) return 'La vitesse de la courbe doit être comprise entre 0,01 et 0,2.';
    if (!isNum(v.houseRtp, 0.5, 0.99)) return 'Le retour au joueur doit être compris entre 50 % et 99 %.';
    if (!isNum(v.maxMultiplier, 2, 1000)) return 'Le plafond du multiplicateur doit être compris entre 2 et 1000.';
    if (!isInt(v.maxExposurePerRound, 1, 1000000000)) return "Le plafond d'exposition doit être un nombre entier de FCFA.";
    return null;
  },
};

// Vérifie que l'appelant est administrateur, et qu'il a un rôle autorisé (si précisé).
async function requireAdmin(db, request, allowedRoles = ROLES) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const snapshot = await db.collection('wy_admins').doc(request.auth.uid).get();
  const role = snapshot.exists ? snapshot.get('role') : null;
  if (!role || !allowedRoles.includes(role)) {
    throw new HttpsError('permission-denied', 'Accès réservé aux administrateurs autorisés.');
  }
  return { uid: request.auth.uid, role };
}

module.exports = { ROLES, SETTINGS, VALIDATORS, HOME_TARGETS, requireAdmin };
