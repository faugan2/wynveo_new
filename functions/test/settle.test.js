const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resultFromScores, legOutcome, settleTicket, splitPayout } = require('../sport/settle.js');

const apiEvent = (scores, completed = true) => ({
  id: 'm1',
  home_team: 'Toulouse',
  away_team: 'Strasbourg',
  completed,
  scores,
});

test('score lu sur le nom des équipes, en texte', () => {
  const result = resultFromScores(
    apiEvent([
      { name: 'Strasbourg', score: '1' },
      { name: 'Toulouse', score: '2' },
    ])
  );
  assert.deepEqual(result, { homeScore: 2, awayScore: 1 });
});

test('matchs de la Ligue 1 réellement terminés (fixture de l\'API) : tous lus', () => {
  const path = require('node:path');
  const finished = require(path.join(__dirname, 'fixtures', 'scores-finished-ligue1.json'));
  assert.equal(finished.length, 6);
  for (const event of finished) {
    assert.ok(resultFromScores(event), `${event.home_team} – ${event.away_team}`);
  }
});

test('format inattendu ou match non terminé : aucun résultat, donc rien ne se règle', () => {
  assert.equal(resultFromScores(apiEvent(null)), null);
  assert.equal(resultFromScores(apiEvent([{ name: 'Toulouse', score: '2' }]), 'x'), null);
  assert.equal(resultFromScores(apiEvent([{ name: 'Toulouse', score: 'deux' }, { name: 'Strasbourg', score: '1' }])), null);
  assert.equal(
    resultFromScores(apiEvent([{ name: 'Toulouse', score: '2' }, { name: 'Strasbourg', score: '1' }], false)),
    null
  );
});

test('1 N 2 : domicile, nul, extérieur', () => {
  const win = { homeScore: 2, awayScore: 1 };
  const draw = { homeScore: 1, awayScore: 1 };
  assert.equal(legOutcome('home', win, 2.5), 'won');
  assert.equal(legOutcome('away', win, 2.5), 'lost');
  assert.equal(legOutcome('draw', draw, 2.5), 'won');
  assert.equal(legOutcome('home', draw, 2.5), 'lost');
});

test('plus/moins 2,5 ; une ligne entière égale au total est remboursée', () => {
  const three = { homeScore: 2, awayScore: 1 };
  assert.equal(legOutcome('over', three, 2.5), 'won');
  assert.equal(legOutcome('under', three, 2.5), 'lost');
  assert.equal(legOutcome('over', { homeScore: 1, awayScore: 1 }, 2), 'void');
});

test('ticket simple gagnant : mise × cote, arrondi vers le bas', () => {
  const outcome = settleTicket(1000, [{ price: 2.15, outcome: 'won' }]);
  assert.deepEqual(outcome, { status: 'won', payout: 2150, multiplier: 2.15 });
});

test('ticket perdu : rien versé', () => {
  assert.deepEqual(settleTicket(1000, [{ price: 2, outcome: 'lost' }]), { status: 'lost', payout: 0, multiplier: 0 });
});

test('combiné : un seul choix perdu fait perdre le ticket', () => {
  const outcome = settleTicket(1000, [
    { price: 2, outcome: 'won' },
    { price: 3, outcome: 'lost' },
  ]);
  assert.equal(outcome.status, 'lost');
  assert.equal(outcome.payout, 0);
});

test('combiné avec un match annulé : ce choix compte à 1, les autres restent', () => {
  const outcome = settleTicket(1000, [
    { price: 2, outcome: 'won' },
    { price: 3, outcome: 'void' },
  ]);
  assert.deepEqual(outcome, { status: 'won', payout: 2000, multiplier: 2 });
});

test('ticket entièrement annulé : remboursé', () => {
  assert.deepEqual(settleTicket(500, [{ price: 2, outcome: 'void' }]), { status: 'void', payout: 500, multiplier: 1 });
});

test('la part versée sur le solde réel suit la mise', () => {
  // Mise de 1 000 : 600 en dépôts, 400 en bonus. Gain de 2 000 : 1 200 en dépôts, 800 en bonus.
  assert.deepEqual(splitPayout(2000, 1000, 600), { payoutReal: 1200, payoutBonus: 800 });
});
