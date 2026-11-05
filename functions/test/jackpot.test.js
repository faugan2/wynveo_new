const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitJackpot } = require('../games.js');

test('la cagnotte se répartit au prorata des tickets de chaque gagnant', () => {
  const shares = splitJackpot(40000, [
    { uid: 'a', tickets: 1 },
    { uid: 'b', tickets: 3 },
  ]);
  assert.deepEqual(shares.map((s) => s.prize), [10000, 30000]);
});

test('la somme des parts vaut exactement la cagnotte, même avec arrondi', () => {
  const shares = splitJackpot(100, [
    { uid: 'a', tickets: 1 },
    { uid: 'b', tickets: 1 },
    { uid: 'c', tickets: 1 },
  ]);
  assert.equal(shares.reduce((sum, s) => sum + s.prize, 0), 100);
});

test("le reste de l'arrondi va au gagnant qui a le plus de tickets", () => {
  const shares = splitJackpot(10, [
    { uid: 'a', tickets: 1 },
    { uid: 'b', tickets: 2 },
  ]);
  assert.deepEqual(shares.map((s) => s.prize), [3, 7]);
});

test('un seul gagnant reçoit toute la cagnotte', () => {
  const shares = splitJackpot(800, [{ uid: 'a', tickets: 4 }]);
  assert.equal(shares[0].prize, 800);
});

test('sans gagnant, aucune part', () => {
  assert.deepEqual(splitJackpot(800, []), []);
});
