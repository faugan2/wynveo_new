import { createWallet } from 'thirdweb/wallets';

// Portefeuilles proposés pour se connecter au dépôt crypto. Même liste que DeFiCircle, sans compte intégré.
export const WALLETS = [
  createWallet('io.metamask'),
  createWallet('com.safepal'),
  createWallet('me.rainbow'),
];
