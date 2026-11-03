const { Timestamp } = require('firebase-admin/firestore');
const { eventPrices } = require('./odds');
const { SPORT_CONFIG } = require('./config');

const API_BASE = 'https://api.the-odds-api.com/v4';

// Cotes d'une compétition. Une erreur (429, panne) est renvoyée telle quelle : les cotes déjà en base restent.
async function fetchLeagueOdds(league, apiKey) {
  const query = new URLSearchParams({
    apiKey,
    regions: SPORT_CONFIG.regions,
    markets: SPORT_CONFIG.markets,
    oddsFormat: 'decimal',
    dateFormat: 'iso',
  });
  const response = await fetch(`${API_BASE}/sports/${league.key}/odds/?${query}`);
  if (!response.ok) {
    throw new Error(`The Odds API : HTTP ${response.status} pour ${league.key}`);
  }
  return {
    events: await response.json(),
    creditsRemaining: response.headers.get('x-requests-remaining'),
  };
}

// Statut d'un match à partir de l'heure et de l'existant. Un match terminé ou annulé ne revient pas en arrière.
function statusFor(commenceMs, existingStatus, now) {
  if (commenceMs > now) return 'upcoming';
  if (['finished', 'cancelled', 'suspended'].includes(existingStatus)) return existingStatus;
  return 'live';
}

// Importe les matchs et cotes d'une compétition dans wy_sport_events (un document par match, id = id de l'API).
// Une cote saisie à la main (manualOdds) n'est jamais écrasée ; seules les infos du match sont mises à jour.
async function importLeagueOdds(db, apiKey, league, now = Date.now()) {
  const { events, creditsRemaining } = await fetchLeagueOdds(league, apiKey);
  const refs = events.map((event) => db.collection('wy_sport_events').doc(event.id));
  const snapshots = refs.length ? await db.getAll(...refs) : [];

  const batch = db.batch();
  let written = 0;
  events.forEach((event, index) => {
    const existing = snapshots[index].exists ? snapshots[index].data() : null;
    const commenceMs = Date.parse(event.commence_time);
    const data = {
      sportKey: league.key,
      league: league.title,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: Timestamp.fromMillis(commenceMs),
      status: statusFor(commenceMs, existing?.status, now),
      updatedAt: Timestamp.fromMillis(now),
    };

    if (!existing?.manualOdds) {
      const odds = eventPrices(event);
      // Pas de cote pour ce match (aucun bookmaker) : on garde les cotes déjà enregistrées.
      if (odds.home !== null) {
        data.odds = odds;
        data.oddsSource = 'api';
        data.oddsUpdatedAt = Timestamp.fromMillis(now);
        written += 1;
      }
    }
    batch.set(refs[index], data, { merge: true });
  });

  batch.set(
    db.collection('wy_settings').doc('sport'),
    { lastImportAt: Timestamp.fromMillis(now), creditsRemaining: creditsRemaining ? Number(creditsRemaining) : null },
    { merge: true }
  );
  await batch.commit();
  return { league: league.key, events: events.length, oddsWritten: written, creditsRemaining };
}

// Import de toutes les compétitions suivies. Une compétition en erreur n'empêche pas les autres.
async function runSportOddsImport(db, apiKey, now = Date.now()) {
  const results = [];
  for (const league of SPORT_CONFIG.leagues) {
    try {
      results.push(await importLeagueOdds(db, apiKey, league, now));
    } catch (error) {
      console.error('Import des cotes en échec', league.key, error.message);
      results.push({ league: league.key, error: error.message });
    }
  }
  return results;
}

module.exports = { importLeagueOdds, runSportOddsImport, statusFor };
