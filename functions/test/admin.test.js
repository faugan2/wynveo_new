const { test } = require('node:test');
const assert = require('node:assert/strict');
const { VALIDATORS } = require('../admin/adminCore.js');

const ADDRESS = '0x71c79BF996932F2060C348f569446B6D0a4DF134';

test('paiements : adresse, taux, minimum et durée valides', () => {
  assert.equal(VALIDATORS.payments({ adminAddress: ADDRESS, rateXofPerUsd: 600, minDepositXof: 30, expiryMinutes: 30 }), null);
});

test('paiements : adresse invalide ou valeurs hors limites refusées', () => {
  assert.match(VALIDATORS.payments({ adminAddress: '0x123', rateXofPerUsd: 600, minDepositXof: 30, expiryMinutes: 30 }), /adresse/);
  assert.match(VALIDATORS.payments({ adminAddress: ADDRESS, rateXofPerUsd: 0, minDepositXof: 30, expiryMinutes: 30 }), /taux/);
  assert.match(VALIDATORS.payments({ adminAddress: ADDRESS, rateXofPerUsd: 600, minDepositXof: 30.5, expiryMinutes: 30 }), /entier/);
  assert.match(VALIDATORS.payments({ adminAddress: ADDRESS, rateXofPerUsd: 600, minDepositXof: 30, expiryMinutes: 1 }), /durée/);
});

test('roue : exactement 8 cases, poids non nuls', () => {
  const segments = Array.from({ length: 8 }, () => ({ multiplier: 2, weight: 100 }));
  assert.equal(VALIDATORS['lucky-spin']({ minStake: 100, maxStake: 1000, segments }), null);
  assert.match(VALIDATORS['lucky-spin']({ minStake: 100, maxStake: 1000, segments: segments.slice(1) }), /8 cases/);
  const zero = segments.map((s) => ({ ...s, weight: 0 }));
  assert.match(VALIDATORS['lucky-spin']({ minStake: 100, maxStake: 1000, segments: zero }), /poids/);
});

test('mises : le minimum ne peut pas dépasser le maximum', () => {
  assert.match(VALIDATORS.crash({ enabled: true, minStake: 5000, maxStake: 100, bettingSeconds: 10, growthRate: 0.06, houseRtp: 0.9, maxMultiplier: 100, maxExposurePerRound: 1000 }), /minimum/);
});

test('crash : bornes du retour au joueur et de la vitesse', () => {
  const base = { enabled: true, minStake: 100, maxStake: 1000, bettingSeconds: 10, growthRate: 0.06, houseRtp: 0.9, maxMultiplier: 100, maxExposurePerRound: 1000 };
  assert.equal(VALIDATORS.crash(base), null);
  assert.match(VALIDATORS.crash({ ...base, houseRtp: 1.2 }), /retour/);
  assert.match(VALIDATORS.crash({ ...base, growthRate: 0.5 }), /courbe/);
});
