import { createThirdwebClient } from 'thirdweb';
import { arbitrum, bsc } from 'thirdweb/chains';

// Client Thirdweb côté navigateur : seule la clé publique (VITE_THIRDWEB_CLIENT_ID) est utilisée ici.
export const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID,
});

// Réseaux utilisés pour les dépôts crypto, par nom renvoyé par le serveur.
export const CHAINS_BY_NETWORK = { bsc, arbitrum };
