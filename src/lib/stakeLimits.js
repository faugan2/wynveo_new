import { useEffect, useState } from 'react';
import { functions } from './firebase.js';

// Mise minimum et maximum d'un jeu, lues dans l'admin (fonction getStakeLimits).
// Tant qu'elles ne sont pas chargées, ou si la lecture échoue, on garde les valeurs de départ (fallback).
const cache = {};

function loadLimits(game, fallback) {
  if (!cache[game]) {
    cache[game] = functions
      .httpsCallable('getStakeLimits')({ game })
      .then(({ data }) =>
        Number.isFinite(data.minStake) && Number.isFinite(data.maxStake)
          ? { minStake: data.minStake, maxStake: data.maxStake }
          : fallback
      )
      .catch(() => {
        delete cache[game]; // on réessaiera à la prochaine ouverture
        return fallback;
      });
  }
  return cache[game];
}

export function useStakeLimits(game, fallback) {
  const [limits, setLimits] = useState(fallback);

  useEffect(() => {
    let active = true;
    loadLimits(game, fallback).then((value) => {
      if (active) setLimits(value);
    });
    return () => {
      active = false;
    };
    // fallback est constant pour un jeu donné : on ne dépend que du nom du jeu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  return limits;
}
