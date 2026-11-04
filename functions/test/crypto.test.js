const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expectedUnits, formatUnits, findTransfer, hasConfirmations } = require('../payments/deposits.js');
const { TRANSFER_TOPIC } = require('../payments/rpc.js');
const { decodeAbiString } = require('../payments/rpc.js');

const TOKEN = '0x55d398326f99059fF775485246999027B3197955';
const ADMIN = '0x71c79BF996932F2060C348f569446B6D0a4DF134';
const PAYER = '0x1111111111111111111111111111111111111111';
const pad = (addr) => '0x' + '0'.repeat(24) + addr.slice(2).toLowerCase();

test('montant attendu : 6000 FCFA à 600 FCFA par dollar = 10 USD, sur 18 décimales', () => {
  assert.equal(expectedUnits(6000, 600, 18, 0), 10n * 10n ** 18n);
});

test('le décalage distingue deux demandes de même montant', () => {
  assert.equal(expectedUnits(6000, 600, 6, 0), 10000000n);
  assert.equal(expectedUnits(6000, 600, 6, 1234), 10001234n);
});

test('le montant est arrondi au centime supérieur', () => {
  // 1000 FCFA / 600 = 1.6666… USD -> 1.67 USD
  assert.equal(formatUnits(expectedUnits(1000, 600, 6, 0), 6), '1.67');
});

test('formatage lisible sans zéros inutiles', () => {
  assert.equal(formatUnits(1500000n, 6), '1.5');
  assert.equal(formatUnits(2000000n, 6), '2');
});

test('transfert trouvé : bon token, bon destinataire, montant suffisant', () => {
  const expected = 10000000n;
  const receipt = {
    logs: [
      {
        address: TOKEN,
        topics: [TRANSFER_TOPIC, pad(PAYER), pad(ADMIN)],
        data: '0x' + (10000000n).toString(16).padStart(64, '0'),
      },
    ],
  };
  const found = findTransfer(receipt, TOKEN, ADMIN, expected);
  assert.equal(found.from, PAYER.toLowerCase());
  assert.equal(found.value, expected);
});

test('transfert refusé : mauvais token, mauvais destinataire ou montant insuffisant', () => {
  const log = (address, to, value) => ({
    address,
    topics: [TRANSFER_TOPIC, pad(PAYER), pad(to)],
    data: '0x' + value.toString(16).padStart(64, '0'),
  });
  assert.equal(findTransfer({ logs: [log('0x0000000000000000000000000000000000000001', ADMIN, 10n)] }, TOKEN, ADMIN, 10n), null);
  assert.equal(findTransfer({ logs: [log(TOKEN, PAYER, 10n)] }, TOKEN, ADMIN, 10n), null);
  assert.equal(findTransfer({ logs: [log(TOKEN, ADMIN, 9n)] }, TOKEN, ADMIN, 10n), null);
});

test('confirmations : au moins le nombre requis de blocs', () => {
  assert.equal(hasConfirmations(100, 110, 12), false);
  assert.equal(hasConfirmations(100, 111, 12), true);
});

test('décodage du symbole ABI (USDT)', () => {
  // ABI string "USDT" : offset 0x20, longueur 4, données
  const hex = '0x' + '0'.repeat(62) + '20' + '0'.repeat(62) + '04' + Buffer.from('USDT').toString('hex').padEnd(64, '0');
  assert.equal(decodeAbiString(hex), 'USDT');
});
