import { useCallback, useEffect, useState } from 'react';
import { db, functions } from './firebase.js';

// Cagnotte et heure du prochain tirage, mises à jour en direct. Utilisé par l'accueil et la liste des jeux.
// Renvoie null tant que les données ne sont pas arrivées.
export function useJackpotSummary() {
  const [summary, setSummary] = useState(null);

  const load = useCallback(() => {
    functions
      .httpsCallable('getJackpotState')({})
      .then(({ data }) => setSummary({ pot: data.pot, drawAt: data.drawAt }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const unsubscribeRound = db
      .collection('wy_jackpot_rounds')
      .where('status', '==', 'open')
      .limit(1)
      .onSnapshot(() => load(), () => {});
    const unsubscribeSettings = db
      .collection('wy_settings')
      .doc('jackpot')
      .onSnapshot(() => load(), () => {});
    return () => {
      unsubscribeRound();
      unsubscribeSettings();
    };
  }, [load]);

  return summary;
}

// Heure du tirage, au format HH:MM (heure locale).
export function formatDrawTime(drawAt) {
  const date = new Date(drawAt);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
