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
};

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

module.exports = { ROLES, SETTINGS, VALIDATORS, requireAdmin };
