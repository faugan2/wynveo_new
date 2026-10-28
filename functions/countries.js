// Doit rester identique à src/config/countries.js (même liste, mêmes longueurs).
const COUNTRIES = [
  { dialCode: '+228', phoneLength: 8, enabled: true }, // Togo
  { dialCode: '+229', phoneLength: 8, enabled: true }, // Bénin
  { dialCode: '+226', phoneLength: 8, enabled: true }, // Burkina Faso
  { dialCode: '+257', phoneLength: 8, enabled: true }, // Burundi
  { dialCode: '+237', phoneLength: 9, enabled: true }, // Cameroun
  { dialCode: '+236', phoneLength: 8, enabled: true }, // Centrafrique
  { dialCode: '+269', phoneLength: 7, enabled: true }, // Comores
  { dialCode: '+242', phoneLength: 9, enabled: true }, // Congo
  { dialCode: '+243', phoneLength: 9, enabled: true }, // RD Congo
  { dialCode: '+225', phoneLength: 10, enabled: true }, // Côte d'Ivoire
  { dialCode: '+253', phoneLength: 8, enabled: true }, // Djibouti
  { dialCode: '+241', phoneLength: 8, enabled: true }, // Gabon
  { dialCode: '+224', phoneLength: 9, enabled: true }, // Guinée
  { dialCode: '+261', phoneLength: 9, enabled: true }, // Madagascar
  { dialCode: '+223', phoneLength: 8, enabled: true }, // Mali
  { dialCode: '+222', phoneLength: 8, enabled: true }, // Mauritanie
  { dialCode: '+227', phoneLength: 8, enabled: true }, // Niger
  { dialCode: '+250', phoneLength: 9, enabled: true }, // Rwanda
  { dialCode: '+221', phoneLength: 9, enabled: true }, // Sénégal
  { dialCode: '+235', phoneLength: 8, enabled: true }, // Tchad
  { dialCode: '+213', phoneLength: 9, enabled: true }, // Algérie
  { dialCode: '+212', phoneLength: 9, enabled: true }, // Maroc
  { dialCode: '+216', phoneLength: 8, enabled: true }, // Tunisie
];

// Vérifie qu'un numéro complet (+indicatif chiffres) correspond à un pays activé.
function isValidPhone(phone) {
  return COUNTRIES.some(
    (c) => c.enabled && phone.startsWith(c.dialCode) && /^\d+$/.test(phone.slice(c.dialCode.length)) && phone.slice(c.dialCode.length).length === c.phoneLength
  );
}

module.exports = { isValidPhone };
