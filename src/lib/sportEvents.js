import { useEffect, useState } from 'react';
import { db } from './firebase.js';

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

// Un match, à partir de son identifiant (page détail).
export function useEvent(eventId) {
  const [event, setEvent] = useState(undefined);

  useEffect(() => {
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
