import { db } from './firebase.js';

// Matchs pour la liste d'administration, lus directement dans wy_sport_events (lecture réservée aux comptes connectés).
// Pagination par curseur : cursor est le dernier document de la page précédente (null pour la première page).
// Renvoie { events, next } ; next vaut null sur la dernière page.
const SPORT_STATUSES = ['upcoming', 'live', 'finished', 'cancelled', 'suspended'];

const oddsOf = (value) =>
  value
    ? { home: value.home ?? null, draw: value.draw ?? null, away: value.away ?? null, over: value.over ?? null, under: value.under ?? null }
    : null;

function toEvent(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    league: d.league || '',
    homeTeam: d.homeTeam || '',
    awayTeam: d.awayTeam || '',
    status: d.status || '—',
    commenceTime: d.commenceTime ? d.commenceTime.toMillis() : 0,
    odds: oddsOf(d.odds),
    oddsSource: d.oddsSource || '',
    manualOdds: d.manualOdds === true,
    manual: d.manual === true,
    oddsUpdatedAt: d.oddsUpdatedAt ? d.oddsUpdatedAt.toMillis() : 0,
  };
}

export function loadAdminSportEvents({ status = '', cursor = null, pageSize = 20 } = {}) {
  let query = db.collection('wy_sport_events');
  if (SPORT_STATUSES.includes(status)) query = query.where('status', '==', status);
  query = query.orderBy('commenceTime', 'desc');
  if (cursor) query = query.startAfter(cursor);

  // Une ligne de plus que la page : elle indique s'il reste des matchs après.
  return query.limit(pageSize + 1).get().then((snapshot) => {
    const docs = snapshot.docs;
    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
    return {
      events: pageDocs.map(toEvent),
      next: hasMore ? pageDocs[pageDocs.length - 1] : null,
    };
  });
}
