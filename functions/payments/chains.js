// Dépôts crypto : réseaux et tokens acceptés. Les adresses des tokens sont fixées ici,
// et le serveur relit symbole et décimales sur la blockchain avant d'accepter un dépôt.
const CRYPTO_CHAINS = {
  bsc: {
    chainId: 56,
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    confirmations: 15,
    tokens: {
      USDT: { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
    },
  },
  arbitrum: {
    chainId: 42161,
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    confirmations: 12,
    tokens: {
      USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6 },
    },
  },
};

// Trouve le réseau et la configuration d'un token à partir de son symbole (USDT ou USDC).
function tokenConfig(symbol) {
  for (const [network, chain] of Object.entries(CRYPTO_CHAINS)) {
    const token = chain.tokens[symbol];
    if (token) return { network, chain, token };
  }
  return null;
}

module.exports = { CRYPTO_CHAINS, tokenConfig };
