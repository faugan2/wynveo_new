// Liste des pays : copie de shared/countries.json (générée par `npm run sync:countries`).
const COUNTRIES = require('./countries.json');

// Vérifie qu'un numéro complet (+indicatif chiffres) correspond à un pays activé.
function isValidPhone(phone) {
  return COUNTRIES.some((c) => {
    if (!c.enabled || !phone.startsWith(c.dialCode)) return false;
    const local = phone.slice(c.dialCode.length);
    return /^\d+$/.test(local) && local.length === c.phoneLength;
  });
}

module.exports = { isValidPhone };
