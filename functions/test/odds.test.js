const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { MARGIN, fairProbabilities, toPrice, eventPrices } = require('../sport/odds.js');

const fixture = require(path.join(__dirname, 'fixtures', 'odds-ligue1.json'));

test('les probabilités sans marge somment à 1', () => {
  const probabilities = fairProbabilities([2.08, 3.85, 3.45]);
  const sum = probabilities.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('la cote Wynveo est arrondie vers le bas à 2 décimales', () => {
  // p = 0,5 : 1 / (0,5 × 1,06) = 1,8867… → 1.88
  assert.equal(toPrice(0.5), 1.88);
});

test('une marge de 6 % : la somme des probabilités 1 N 2 vaut environ 106 %', () => {
  for (const event of fixture) {
    const prices = eventPrices(event);
    const sum = 1 / prices.home + 1 / prices.draw + 1 / prices.away;
    assert.ok(sum >= MARGIN - 1e-9, `${event.home_team} – ${event.away_team} : ${sum}`);
    assert.ok(sum <= MARGIN + 0.03, `${event.home_team} – ${event.away_team} : ${sum}`);
  }
});

test('chaque match de la Ligue 1 a un 1 N 2 et un plus/moins 2,5', () => {
  assert.equal(fixture.length, 18);
  for (const event of fixture) {
    const prices = eventPrices(event);
    assert.ok(prices.home > 1 && prices.draw > 1 && prices.away > 1, `${event.home_team}`);
    assert.equal(prices.line, 2.5);
    assert.ok(prices.over > 1 && prices.under > 1, `${event.home_team} : plus/moins 2,5`);
  }
});

test('les cotes d\'échange (h2h_lay) ne comptent pas dans le calcul', () => {
  const event = fixture.find((item) => item.bookmakers.some((b) => b.markets.some((m) => m.key === 'h2h_lay')));
  assert.ok(event, 'un match avec h2h_lay est attendu dans la fixture');
  const withoutLay = {
    ...event,
    bookmakers: event.bookmakers.map((bookmaker) => ({
      ...bookmaker,
      markets: bookmaker.markets.filter((market) => market.key !== 'h2h_lay'),
    })),
  };
  assert.deepEqual(eventPrices(event), eventPrices(withoutLay));
});

test('une ligne de plus/moins autre que 2,5 ne modifie pas la cote', () => {
  const event = fixture[0];
  const withOnlyOtherLines = {
    ...event,
    bookmakers: event.bookmakers.map((bookmaker) => ({
      ...bookmaker,
      markets: bookmaker.markets.map((market) =>
        market.key === 'totals'
          ? { ...market, outcomes: market.outcomes.map((o) => ({ ...o, point: 3.5 })) }
          : market
      ),
    })),
  };
  assert.equal(eventPrices(withOnlyOtherLines).over, null);
});
