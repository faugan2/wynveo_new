import { useEffect, useState } from 'react';
import { db, functions } from './firebase.js';

// Coordonnées du support (e-mail, WhatsApp, Telegram, horaires, ligne d'aide), lues directement dans wy_settings/support.
// Utilisées dans l'en-tête, le pied de page et le menu : une seule lecture, sans appel de fonction.
let supportPromise = null;

function loadSupport() {
  if (!supportPromise) {
    supportPromise = db
      .collection('wy_settings')
      .doc('support')
      .get()
      .then((snapshot) => {
        const data = snapshot.exists ? snapshot.data() : {};
        return {
          email: data.email || '',
          whatsapp: data.whatsapp || '',
          telegram: data.telegram || '',
          hours: data.hours || '',
          helpline: data.helpline || '',
        };
      })
      .catch(() => {
        supportPromise = null;
        return null;
      });
  }
  return supportPromise;
}

export function useSupportContacts() {
  const [support, setSupport] = useState(null);

  useEffect(() => {
    let active = true;
    loadSupport().then((value) => {
      if (active) setSupport(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return support;
}

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
