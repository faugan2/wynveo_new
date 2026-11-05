import { useEffect, useState } from 'react';
import { functions } from './firebase.js';

// Informations d'aide lues dans les réglages (fonction getHelpInfo).
export function useHelpInfo() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    functions
      .httpsCallable('getHelpInfo')({})
      .then(({ data }) => active && setInfo(data))
      .catch((err) => active && setError(err?.message || 'Informations indisponibles.'));
    return () => {
      active = false;
    };
  }, []);

  return { info, error };
}
