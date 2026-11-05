import { useEffect, useState } from 'react';
import { functions } from './firebase.js';

// Nombre de parties par jeu (clé = identifiant de la page Jeux, ex. « lucky-spin »).
// Une seule lecture par chargement de l'application : la promesse est gardée en mémoire.
let countsPromise = null;

function loadPlayCounts() {
  if (!countsPromise) {
    countsPromise = functions
      .httpsCallable('getGamePlayCounts')({})
      .then(({ data }) => data.counts || {})
      .catch(() => {
        countsPromise = null; // on réessaiera à la prochaine ouverture
        return null;
      });
  }
  return countsPromise;
}

// Compteurs de parties, ou null tant qu'ils ne sont pas chargés (ou si la lecture échoue).
export function usePlayCounts() {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let active = true;
    loadPlayCounts().then((value) => {
      if (active) setCounts(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return counts;
}

// « 1,2 k », « 385 k », « 5,7 M » : format compact, comme sur les vitrines de vidéos.
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

export function formatPlays(count) {
  return `${compact.format(count)} ${count === 1 ? 'partie' : 'parties'}`;
}
