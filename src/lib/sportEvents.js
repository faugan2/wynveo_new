import { useEffect, useRef, useState } from 'react';
import { db, functions } from './firebase.js';

// Matchs à venir, en direct, mis à jour depuis wy_sport_events (écrit par les fonctions d'import).
// Filtre sur l'heure seulement : pas besoin d'index composite. Le tri se fait ici.
export function useUpcomingEvents() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const since = new Date(Date.now() - 2 * 3600 * 1000);
    const unsubscribe = db
      .collection('wy_sport_events')
      .where('commenceTime', '>=', since)
      .onSnapshot(
        (snapshot) => {
          const list = snapshot.docs
            .map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                sportKey: data.sportKey || '',
                league: data.league,
                homeTeam: data.homeTeam,
                awayTeam: data.awayTeam,
                commenceMs: data.commenceTime.toMillis(),
                status: data.status,
                odds: data.odds || null,
              };
            })
            .filter((event) => event.status !== 'finished' && event.status !== 'cancelled')
            .sort((a, b) => a.commenceMs - b.commenceMs);
          setEvents(list);
        },
        () => setError('Matchs indisponibles pour le moment.')
      );
    return unsubscribe;
  }, []);

  return { events, error };
}

// Compétitions visibles dans l'application (réglées par l'admin dans wy_sport_leagues) : Map clé → nom.
export function useVisibleLeagues() {
  const [leagues, setLeagues] = useState(null);

  useEffect(() => {
    const unsubscribe = db
      .collection('wy_sport_leagues')
      .where('visible', '==', true)
      .onSnapshot(
        (snapshot) => setLeagues(new Map(snapshot.docs.map((doc) => [doc.id, doc.get('title') || doc.id]))),
        () => setLeagues(new Map())
      );
    return unsubscribe;
  }, []);

  return leagues;
}

// Matchs affichés : ceux d'une compétition visible, plus les matchs ajoutés à la main par l'admin.
export function visibleEvents(events, keys) {
  if (!events || !keys) return events;
  return events.filter((event) => event.sportKey === 'manual' || keys.has(event.sportKey));
}

// Un match, à partir de son identifiant (page détail).
export function useEvent(eventId) {
  const [event, setEvent] = useState(undefined);

  useEffect(() => {
    if (!eventId) return undefined;
    const unsubscribe = db
      .collection('wy_sport_events')
      .doc(eventId)
      .onSnapshot(
        (snapshot) => {
          if (!snapshot.exists) {
            setEvent(null);
            return;
          }
          const data = snapshot.data();
          setEvent({
            id: snapshot.id,
            league: data.league,
            homeTeam: data.homeTeam,
            awayTeam: data.awayTeam,
            commenceMs: data.commenceTime.toMillis(),
            status: data.status,
            odds: data.odds || null,
          });
        },
        () => setEvent(null)
      );
    return unsubscribe;
  }, [eventId]);

  return event;
}

// Matchs à venir, par pages de `pageSize` (10 par défaut). « Suivant » charge la page suivante ;
// les pages déjà chargées restent en mémoire, « Précédent » les réaffiche sans les relire.
// Les cotes se mettent à jour en direct sur la page affichée.
export function usePagedUpcomingEvents(pageSize = 10) {
  const [page, setPage] = useState(0);
  const [view, setView] = useState(null); // { events, hasMore } de la page affichée
  const [error, setError] = useState('');
  const cacheRef = useRef([]); // cacheRef.current[i] = { events, last, hasMore } pour la page i
  const sinceRef = useRef(null);
  if (sinceRef.current === null) sinceRef.current = new Date(Date.now() - 2 * 3600 * 1000);

  useEffect(() => {
    const cached = cacheRef.current[page];
    if (cached) {
      setView({ events: cached.events, hasMore: cached.hasMore });
      return undefined;
    }
    const previous = page > 0 ? cacheRef.current[page - 1] : null;
    if (page > 0 && !previous) return undefined;

    setView(null);
    let query = db
      .collection('wy_sport_events')
      .where('commenceTime', '>=', sinceRef.current)
      .orderBy('commenceTime')
      .limit(pageSize);
    if (previous && previous.last) query = query.startAfter(previous.last);

    const unsubscribe = query.onSnapshot(
      (snapshot) => {
        const events = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              sportKey: data.sportKey || '',
              league: data.league,
              homeTeam: data.homeTeam,
              awayTeam: data.awayTeam,
              commenceMs: data.commenceTime.toMillis(),
              status: data.status,
              odds: data.odds || null,
            };
          })
          .filter((event) => event.status !== 'finished' && event.status !== 'cancelled');
        const hasMore = snapshot.docs.length === pageSize;
        const last = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
        cacheRef.current[page] = { events, last, hasMore };
        setView({ events, hasMore });
        setError('');
      },
      () => setError('Matchs indisponibles pour le moment.')
    );
    return unsubscribe;
  }, [page, pageSize]);

  return {
    events: view ? view.events : null,
    error,
    page,
    hasPrev: page > 0,
    hasNext: Boolean(view && view.hasMore),
    goNext: () => setPage((current) => (cacheRef.current[current]?.hasMore ? current + 1 : current)),
    goPrev: () => setPage((current) => Math.max(0, current - 1)),
  };
}

// Heure seule, « 19:45 » : pour les cartes sous un titre de jour.
export function timeLabel(commenceMs) {
  const date = new Date(commenceMs);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Heure du coup d'envoi : « 17:30 », ou « Demain 17:30 » / « Aujourd'hui » selon le jour.
export function kickoffLabel(commenceMs) {
  const date = new Date(commenceMs);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const today = new Date();
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  if (date.toDateString() === today.toDateString()) return time;
  if (date.toDateString() === tomorrow.toDateString()) return `Demain ${time}`;
  return `${date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

// Libellé d'un choix : nom de l'équipe, « Nul », ou « Plus de 2,5 buts ».
export function pickLabel(event, pick) {
  if (pick === 'home') return event.homeTeam;
  if (pick === 'away') return event.awayTeam;
  if (pick === 'draw') return 'Nul';
  if (pick === 'over') return `Plus de ${event.odds.line} buts`;
  return `Moins de ${event.odds.line} buts`;
}

// Choix prêt à entrer dans le coupon, avec la cote affichée au moment du clic.
export function selectionFor(event, pick) {
  return {
    eventId: event.id,
    pick,
    price: event.odds[pick],
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    label: pickLabel(event, pick),
    league: event.league,
    commenceMs: event.commenceMs,
  };
}

// Un match est ouvert aux paris tant qu'il n'a pas commencé.
export const isBettable = (event) => Boolean(event && event.odds && event.commenceMs > Date.now() && event.status === 'upcoming');

// Prochains matchs pour l'accueil visiteur (sans connexion) : liste vide si la lecture échoue.
export function usePublicMatches() {
  const [matches, setMatches] = useState(null);

  useEffect(() => {
    let active = true;
    functions
      .httpsCallable('getPublicMatches')({})
      .then(({ data }) => {
        if (active) setMatches(Array.isArray(data.matches) ? data.matches : []);
      })
      .catch(() => {
        if (active) setMatches([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return matches;
}

// Un match pour un visiteur (page détail sans connexion). undefined = chargement, null = introuvable.
export function usePublicEvent(eventId) {
  const [event, setEvent] = useState(undefined);

  useEffect(() => {
    if (!eventId) return undefined;
    let active = true;
    setEvent(undefined);
    functions
      .httpsCallable('getPublicMatch')({ eventId })
      .then(({ data }) => {
        if (active) setEvent(data.match || null);
      })
      .catch(() => {
        if (active) setEvent(null);
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  return event;
}
