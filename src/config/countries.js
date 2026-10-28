// Pays acceptés à l'inscription et à la connexion.
// Pays francophones d'Afrique. Pour désactiver un pays, passez `enabled` à false.
// Le format du numéro suit `phoneLength` (chiffres après l'indicatif).
// À vérifier avec les opérateurs avant la mise en ligne : longueurs de numéro et moyens de paiement.
//
// Important : functions/countries.js doit rester identique (il contrôle les numéros côté serveur).
export const COUNTRIES = [
  { code: 'TG', name: 'Togo', dialCode: '+228', phoneLength: 8, enabled: true },
  { code: 'BJ', name: 'Bénin', dialCode: '+229', phoneLength: 8, enabled: true },
  { code: 'BF', name: 'Burkina Faso', dialCode: '+226', phoneLength: 8, enabled: true },
  { code: 'BI', name: 'Burundi', dialCode: '+257', phoneLength: 8, enabled: true },
  { code: 'CM', name: 'Cameroun', dialCode: '+237', phoneLength: 9, enabled: true },
  { code: 'CF', name: 'Centrafrique', dialCode: '+236', phoneLength: 8, enabled: true },
  { code: 'KM', name: 'Comores', dialCode: '+269', phoneLength: 7, enabled: true },
  { code: 'CG', name: 'Congo', dialCode: '+242', phoneLength: 9, enabled: true },
  { code: 'CD', name: 'RD Congo', dialCode: '+243', phoneLength: 9, enabled: true },
  { code: 'CI', name: "Côte d'Ivoire", dialCode: '+225', phoneLength: 10, enabled: true },
  { code: 'DJ', name: 'Djibouti', dialCode: '+253', phoneLength: 8, enabled: true },
  { code: 'GA', name: 'Gabon', dialCode: '+241', phoneLength: 8, enabled: true },
  { code: 'GN', name: 'Guinée', dialCode: '+224', phoneLength: 9, enabled: true },
  { code: 'MG', name: 'Madagascar', dialCode: '+261', phoneLength: 9, enabled: true },
  { code: 'ML', name: 'Mali', dialCode: '+223', phoneLength: 8, enabled: true },
  { code: 'MR', name: 'Mauritanie', dialCode: '+222', phoneLength: 8, enabled: true },
  { code: 'NE', name: 'Niger', dialCode: '+227', phoneLength: 8, enabled: true },
  { code: 'RW', name: 'Rwanda', dialCode: '+250', phoneLength: 9, enabled: true },
  { code: 'SN', name: 'Sénégal', dialCode: '+221', phoneLength: 9, enabled: true },
  { code: 'TD', name: 'Tchad', dialCode: '+235', phoneLength: 8, enabled: true },
  { code: 'DZ', name: 'Algérie', dialCode: '+213', phoneLength: 9, enabled: true },
  { code: 'MA', name: 'Maroc', dialCode: '+212', phoneLength: 9, enabled: true },
  { code: 'TN', name: 'Tunisie', dialCode: '+216', phoneLength: 8, enabled: true },
].map((country) => ({
  ...country,
  // Drapeau emoji à partir du code pays (ex. TG -> 🇹🇬).
  flag: String.fromCodePoint(...[...country.code].map((c) => 127397 + c.charCodeAt(0))),
}));

export const ENABLED_COUNTRIES = COUNTRIES.filter((c) => c.enabled);

// Togo en premier : c'est le pays sélectionné par défaut.
export const DEFAULT_COUNTRY = ENABLED_COUNTRIES.find((c) => c.code === 'TG') ?? ENABLED_COUNTRIES[0];

// Renvoie le numéro complet (indicatif + chiffres) si la saisie est valide, sinon null.
export function buildPhone(country, localNumber) {
  const digits = localNumber.replace(/\D/g, '');
  if (digits.length !== country.phoneLength) return null;
  return `${country.dialCode}${digits}`;
}
