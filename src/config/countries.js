// Pays acceptés à l'inscription et à la connexion.
// Au lancement, seul le Togo est disponible. Pour ajouter un pays :
// ajoutez une entrée ici, le format et la longueur du numéro suivent automatiquement.
export const COUNTRIES = [
  {
    code: 'TG',
    name: 'Togo',
    dialCode: '+228',
    flag: '🇹🇬',
    phoneLength: 8,
    enabled: true,
  },
];

export const ENABLED_COUNTRIES = COUNTRIES.filter((c) => c.enabled);

export const DEFAULT_COUNTRY = ENABLED_COUNTRIES[0];

// Renvoie le numéro complet (indicatif + chiffres) si la saisie est valide, sinon null.
export function buildPhone(country, localNumber) {
  const digits = localNumber.replace(/\D/g, '');
  if (digits.length !== country.phoneLength) return null;
  return `${country.dialCode}${digits}`;
}
