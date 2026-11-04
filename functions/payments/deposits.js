// Logique pure des dépôts crypto : montant attendu, recherche du transfert, confirmations.
const { TRANSFER_TOPIC } = require('./rpc');

// Taux fixé pour le démarrage : 600 FCFA par dollar. Modifiable dans wy_settings/payments.
const DEFAULT_RATE_XOF_PER_USD = 600;
const DEFAULT_MIN_DEPOSIT_XOF = 1000;
const DEFAULT_EXPIRY_MINUTES = 30;
// Plage de décalage (en plus petites unités) qui distingue deux demandes en attente de même montant.
const UNIQUE_SUFFIX_MAX = 9999;

// Montant exact attendu, en plus petite unité du token, arrondi au centime supérieur.
// Le décalage aléatoire rend le montant unique parmi les demandes en attente.
function expectedUnits(amountXof, rate, decimals, suffix) {
  const cents = Math.ceil((amountXof / rate) * 100 - 1e-9);
  const base = BigInt(cents) * 10n ** BigInt(decimals - 2);
  const step = 10n ** BigInt(decimals - 6);
  return base + BigInt(suffix) * step;
}

// Texte lisible d'un montant en plus petite unité, par exemple 1500000n (6 décimales) -> « 1.5 ».
function formatUnits(units, decimals) {
  const divisor = 10n ** BigInt(decimals);
  const whole = units / divisor;
  const fraction = (units % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

// Cherche dans le reçu un transfert du token vers l'adresse admin, d'au moins le montant attendu.
// Renvoie l'expéditeur et le montant, ou null.
function findTransfer(receipt, tokenAddress, toAddress, expected) {
  const token = tokenAddress.toLowerCase();
  const to = toAddress.toLowerCase();
  for (const log of receipt.logs || []) {
    if (log.address.toLowerCase() !== token) continue;
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    const logTo = '0x' + log.topics[2].slice(26).toLowerCase();
    if (logTo !== to) continue;
    const value = BigInt(log.data);
    if (value >= expected) {
      return { from: '0x' + log.topics[1].slice(26).toLowerCase(), value };
    }
  }
  return null;
}

// Le reçu a assez de blocs de confirmation.
function hasConfirmations(receiptBlock, currentBlock, required) {
  return currentBlock - receiptBlock + 1 >= required;
}

module.exports = {
  DEFAULT_RATE_XOF_PER_USD,
  DEFAULT_MIN_DEPOSIT_XOF,
  DEFAULT_EXPIRY_MINUTES,
  UNIQUE_SUFFIX_MAX,
  expectedUnits,
  formatUnits,
  findTransfer,
  hasConfirmations,
};
