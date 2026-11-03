// Données factices du portefeuille, pour construire les écrans avant le branchement réel.
// À remplacer par les données Firestore (wy_wallets) et Chariow une fois l'API intégrée.
export const MOCK_WALLET = {
  balance: 25000,
  withdrawable: 23000,
  bonus: 2000,
  bonusTarget: 10000,
  bonusRemainingBets: 13000,
};

export const PAYMENT_METHODS = [
  { id: 'tmoney', label: 'T-Money', short: 'TMo', color: '#f5c518', phone: '+228 90 •• •• 56' },
  { id: 'flooz', label: 'Flooz (Moov)', short: 'Fl', color: '#2aa8e0', phone: '+228 96 •• •• 12' },
  { id: 'card', label: 'Carte bancaire', short: '💳', color: '#3b3a66' },
];

export const DEPOSIT_AMOUNTS = [1000, 5000, 10000, 25000];
export const WITHDRAW_AMOUNTS = [5000, 10000, 15000];

export const OPERATIONS = [
  { id: 'op1', label: 'Dépôt T-Money', date: "Aujourd'hui 08:55", amount: 20000 },
  { id: 'op2', label: 'Retrait Flooz', date: 'Hier 19:10', amount: -15000 },
];

export const JACKPOT = { amount: 2500000, draw: '20:00' };

export const DEPOSIT_RESULT = {
  reference: 'DEP-1014-77812',
  operator: 'T-Money · +228 90 •• •• 56',
  bonus: 5000,
  newBalance: 35000,
};
