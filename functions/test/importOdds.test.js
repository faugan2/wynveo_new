const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { importLeagueOdds, statusFor } = require('../sport/importOdds.js');
const { SPORT_CONFIG } = require('../sport/config.js');

const fixture = require(path.join(__dirname, 'fixtures', 'odds-ligue1.json'));
const NOW = Date.parse('2026-11-03T12:00:00Z');
const league = SPORT_CONFIG.leagues[0];

// Faux Firestore : garde les écritures en mémoire et renvoie les documents déjà présents.
function fakeDb(existing = {}) {
  const writes = [];
  const docRef = (collection, id) => ({ collection, id, path: `${collection}/${id}` });
  const snapshotOf = (ref) => ({
    id: ref.id,
    exists: Object.prototype.hasOwnProperty.call(existing, ref.path),
    data: () => existing[ref.path],
  });
  const db = {
    writes,
    collection: (name) => ({ doc: (id) => docRef(name, id) }),
    getAll: async (...refs) => refs.map(snapshotOf),
    batch: () => ({
      set: (ref, data, options) => writes.push({ ref, data, options }),
      commit: async () => {},
    }),
  };
  return db;
}

let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

function stubFetch(body, { ok = true, status = 200, remaining = '495' } = {}) {
  global.fetch = async (url) => {
    global.fetchedUrl = String(url);
    return {
      ok,
      status,
      json: async () => body,
      headers: { get: (name) => (name === 'x-requests-remaining' ? remaining : null) },
    };
  };
}

test('un match par document, avec les cotes Wynveo et le statut « à venir »', async () => {
  stubFetch(fixture);
  const db = fakeDb();
  const result = await importLeagueOdds(db, 'TEST_KEY', league, NOW);

  const eventWrites = db.writes.filter((write) => write.ref.collection === 'wy_sport_events');
  assert.equal(eventWrites.length, 18);
  assert.equal(result.oddsWritten, 18);
  const first = eventWrites[0].data;
  assert.equal(first.status, 'upcoming');
  assert.equal(first.homeTeam, fixture[0].home_team);
  assert.ok(first.odds.home > 1 && first.odds.draw > 1 && first.odds.away > 1);
  assert.equal(first.odds.line, 2.5);
  assert.equal(first.oddsSource, 'api');
  assert.equal(eventWrites[0].options.merge, true);
});

test('la clé est envoyée à l\'API et le crédit restant est enregistré', async () => {
  stubFetch(fixture, { remaining: '495' });
  const db = fakeDb();
  const result = await importLeagueOdds(db, 'TEST_KEY', league, NOW);

  assert.match(global.fetchedUrl, /apiKey=TEST_KEY/);
  assert.match(global.fetchedUrl, /markets=h2h%2Ctotals|markets=h2h,totals/);
  assert.equal(result.creditsRemaining, '495');
  const settings = db.writes.find((write) => write.ref.collection === 'wy_settings');
  assert.equal(settings.data.creditsRemaining, 495);
});

test('une cote saisie à la main n\'est jamais écrasée', async () => {
  stubFetch(fixture);
  const manualId = fixture[0].id;
  const db = fakeDb({ [`wy_sport_events/${manualId}`]: { manualOdds: true, status: 'upcoming' } });
  await importLeagueOdds(db, 'TEST_KEY', league, NOW);

  const write = db.writes.find((item) => item.ref.id === manualId);
  assert.equal(write.data.odds, undefined);
  assert.equal(write.data.homeTeam, fixture[0].home_team);
});

test('en cas d\'erreur de l\'API, rien n\'est écrit', async () => {
  stubFetch({ message: 'limit' }, { ok: false, status: 429 });
  const db = fakeDb();
  await assert.rejects(() => importLeagueOdds(db, 'TEST_KEY', league, NOW), /HTTP 429/);
  assert.equal(db.writes.length, 0);
});

test('statut : un match terminé ou annulé ne revient pas en arrière', () => {
  const past = NOW - 3600 * 1000;
  const future = NOW + 3600 * 1000;
  assert.equal(statusFor(future, undefined, NOW), 'upcoming');
  assert.equal(statusFor(past, undefined, NOW), 'live');
  assert.equal(statusFor(past, 'finished', NOW), 'finished');
  assert.equal(statusFor(past, 'cancelled', NOW), 'cancelled');
});
