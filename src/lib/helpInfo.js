import { useEffect, useState } from 'react';
import { functions } from './firebase.js';

// Compte Telegram du support : accepte « @nom », « nom » ou « https://t.me/nom ». Renvoie { handle, url } ou null.
export function telegramLink(value) {
  const handle = String(value || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
  if (!handle) return null;
  return { handle: `@${handle}`, url: `https://t.me/${handle}` };
}

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
