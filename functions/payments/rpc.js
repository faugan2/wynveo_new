// Appels JSON-RPC vers un nœud EVM (sans dépendance externe).
const DECIMALS_SELECTOR = '0x313ce567'; // decimals()
const SYMBOL_SELECTOR = '0x95d89b41'; // symbol()
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function rpc(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC ${method} : HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`RPC ${method} : ${body.error.message}`);
  return body.result;
}

// Lit symbole et décimales du contrat : on ne fait confiance ni à la base ni au navigateur.
async function readTokenMetadata(rpcUrl, tokenAddress) {
  const decimalsHex = await rpc(rpcUrl, 'eth_call', [{ to: tokenAddress, data: DECIMALS_SELECTOR }, 'latest']);
  const symbolHex = await rpc(rpcUrl, 'eth_call', [{ to: tokenAddress, data: SYMBOL_SELECTOR }, 'latest']);
  return { decimals: Number(BigInt(decimalsHex)), symbol: decodeAbiString(symbolHex) };
}

// Décode une chaîne ABI (symbole) renvoyée par eth_call.
function decodeAbiString(hex) {
  const data = hex.slice(2);
  const length = Number(BigInt('0x' + data.slice(64, 128)));
  return Buffer.from(data.slice(128, 128 + length * 2), 'hex').toString('utf8');
}

const blockNumber = async (rpcUrl) => Number(BigInt(await rpc(rpcUrl, 'eth_blockNumber', [])));
const getReceipt = (rpcUrl, txHash) => rpc(rpcUrl, 'eth_getTransactionReceipt', [txHash]);

module.exports = { TRANSFER_TOPIC, rpc, readTokenMetadata, blockNumber, getReceipt, decodeAbiString };
