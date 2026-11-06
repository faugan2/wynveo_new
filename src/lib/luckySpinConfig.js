import { useEffect, useState } from 'react';
import { functions } from './firebase.js';
import { LUCKY_SPIN_SEGMENTS, LUCKY_SPIN_STAKE } from '../content/luckySpin.js';

// Réglages de la roue lus dans l'admin (mise minimum et maximum, multiplicateurs des cases).
// Tant qu'ils ne sont pas chargés, ou si la lecture échoue, on garde les valeurs de départ du fichier content.
const FALLBACK = {
  minStake: LUCKY_SPIN_STAKE.min,
  maxStake: LUCKY_SPIN_STAKE.max,
  multipliers: LUCKY_SPIN_SEGMENTS.map((segment) => segment.multiplier),
};

let configPromise = null;

function loadConfig() {
  if (!configPromise) {
    configPromise = functions
      .httpsCallable('getLuckySpinConfig')({})
      .then(({ data }) =>
        Number.isFinite(data.minStake) && Number.isFinite(data.maxStake) && data.multipliers?.length === LUCKY_SPIN_SEGMENTS.length
          ? { minStake: data.minStake, maxStake: data.maxStake, multipliers: data.multipliers }
          : FALLBACK
      )
      .catch(() => {
        configPromise = null; // on réessaiera à la prochaine ouverture
        return FALLBACK;
      });
  }
  return configPromise;
}

export function useLuckySpinConfig() {
  const [config, setConfig] = useState(FALLBACK);

  useEffect(() => {
    let active = true;
    loadConfig().then((value) => {
      if (active) setConfig(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return config;
}

// Libellé d'une case : « 2x », « 0,5x ».
export function multiplierLabel(multiplier) {
  return `${String(multiplier).replace('.', ',')}x`;
}
