const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { LIMITS, priceSelections, checkCoupon, potentialPayout } = require('../sport/betRules.js');
const { eventPrices } = require('../sport/odds.js');

const fixture = require(path.join(__dirname, 'fixtures', 'odds-ligue1.json'));
const NOW = Date.parse('2026-11-03T12:00:00Z');

// Matchs de la fixture, comme les écrit l'import dans wy_sport_events.
function eventsFromFixture(now = NOW) {
  const events = new Map();
  for (const event of fixture) {
    events.set(event.id, {
      status: 'upcoming',
      commenceTimeMs: Date.parse(event.commence_time),
      oddsUpdatedMs: now,
      odds: eventPrices(event),
      homeTeam: event.home_team,
      awayTeam: event.away_team,
    });
  }
  return events;
}

const [first, second] = fixture;

test('un coupon simple valide passe', () => {
  assert.doesNotThrow(() =>
    checkCoupon({ mode: 'single', stake: 1000, selections: [{ eventId: first.id, pick: 'home', price: 2 }] })
  );
});

test('mise hors limites ou type inconnu : refusé', () => {
  const selections = [{ eventId: first.id, pick: 'home', price: 2 }];
  assert.throws(() => checkCoupon({ mode: 'single', stake: 50, selections }), /Mise invalide/);
  assert.throws(() => checkCoupon({ mode: 'single', stake: LIMITS.maxStake + 1, selections }), /Mise invalide/);
  assert.throws(() => checkCoupon({ mode: 'triple', stake: 1000, selections }), /Type de coupon/);
});

test('un combiné : 2 à 10 choix, un seul choix par match', () => {
  const one = [{ eventId: first.id, pick: 'home', price: 2 }];
  assert.throws(() => checkCoupon({ mode: 'combo', stake: 1000, selections: one }), /2 à 10/);
  const sameMatch = [
    { eventId: first.id, pick: 'home', price: 2 },
    { eventId: first.id, pick: 'over', price: 1.9 },
  ];
  assert.throws(() => checkCoupon({ mode: 'combo', stake: 1000, selections: sameMatch }), /Un seul choix par match/);
});

test('un match déjà commencé ferme les paris', () => {
  const events = eventsFromFixture();
  events.get(first.id).commenceTimeMs = NOW - 1000;
  assert.throws(
    () => priceSelections([{ eventId: first.id, pick: 'home', price: 2 }], events, NOW),
    /paris sont fermés/
  );
});

test('des cotes plus vieilles que 6 h bloquent les paris', () => {
  const events = eventsFromFixture(NOW - LIMITS.maxOddsAgeMs - 1000);
  assert.throws(
    () => priceSelections([{ eventId: first.id, pick: 'home', price: 2 }], events, NOW),
    /Cotes indisponibles/
  );
});

test('une cote modifiée est signalée avec son nouveau prix', () => {
  const events = eventsFromFixture();
  const current = events.get(first.id).odds.home;
  const { lines, changes } = priceSelections(
    [{ eventId: first.id, pick: 'home', price: current + 0.5 }],
    events,
    NOW
  );
  assert.equal(lines[0].price, current);
  assert.deepEqual(changes, [{ eventId: first.id, pick: 'home', oldPrice: current + 0.5, newPrice: current }]);
});

test('un choix qui n\'existe pas est refusé', () => {
  const events = eventsFromFixture();
  assert.throws(
    () => priceSelections([{ eventId: first.id, pick: 'penalty', price: 2 }], events, NOW),
    /Choix de pari invalide/
  );
  assert.throws(
    () => priceSelections([{ eventId: 'inconnu', pick: 'home', price: 2 }], events, NOW),
    /Match introuvable/
  );
});

test('gain : mise × produit des cotes, arrondi vers le bas', () => {
  assert.deepEqual(potentialPayout(1000, [2]), { totalPrice: 2, payout: 2000 });
  assert.deepEqual(potentialPayout(1000, [2, 3]), { totalPrice: 6, payout: 6000 });
  assert.equal(potentialPayout(100, [1.333]).payout, 133);
});

test('les deux matchs de la fixture donnent des lignes distinctes', () => {
  const events = eventsFromFixture();
  const { lines } = priceSelections(
    [
      { eventId: first.id, pick: 'home', price: events.get(first.id).odds.home },
      { eventId: second.id, pick: 'draw', price: events.get(second.id).odds.draw },
    ],
    events,
    NOW
  );
  assert.equal(lines.length, 2);
  assert.notEqual(lines[0].eventId, lines[1].eventId);
});

test('gain avec une cote décimale : 100 × 2,03 = 203, pas 202 (erreur d\'arrondi binaire)', () => {
  assert.equal(potentialPayout(100, [2.03]).payout, 203);
});

test('combiné : le gain se calcule sur la cote affichée (2,03 × 1,77 = 3,59 → 1 795 sur 500)', () => {
  assert.deepEqual(potentialPayout(500, [2.03, 1.77]), { totalPrice: 3.59, payout: 1795 });
});
