// Formate un montant en FCFA : 25 000 FCFA.
// Avec { unit: false }, renvoie seulement le nombre (25 000).
export function formatFcfa(amount, { unit = true } = {}) {
  const number = Math.abs(amount).toLocaleString('fr-FR').replace(/ | /g, ' ');
  const sign = amount < 0 ? '−' : '';
  return unit ? `${sign}${number} FCFA` : `${sign}${number}`;
}
