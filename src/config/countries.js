import countriesData from '../../shared/countries.json';

// Pays acceptés à l'inscription et à la connexion.
// La liste vient de shared/countries.json (source unique, partagée avec les Cloud Functions).
// Pour désactiver un pays, passez `enabled` à false dans ce fichier, puis lancez `npm run sync:countries`.
export const COUNTRIES = countriesData.map((country) => ({
  ...country,
  // Le drapeau SVG est affiché par la classe `fi fi-<code>` (bibliothèque flag-icons).
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
