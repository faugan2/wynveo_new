import { useEffect, useState } from 'react';
import { db } from './firebase.js';

// Logo de l'application (réglé dans l'admin), lu directement dans wy_settings/branding. Une seule lecture par chargement.
// Renvoie une chaîne vide tant que le logo n'est pas connu ou s'il n'y en a pas : l'en-tête affiche alors le texte.
let logoPromise = null;

function loadLogo() {
  if (!logoPromise) {
    logoPromise = db
      .collection('wy_settings')
      .doc('branding')
      .get()
      .then((snapshot) => {
        const url = snapshot.exists ? snapshot.get('logoUrl') : '';
        return typeof url === 'string' ? url : '';
      })
      .catch(() => {
        logoPromise = null; // on réessaiera à la prochaine ouverture
        return '';
      });
  }
  return logoPromise;
}

export function useLogoUrl() {
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    let active = true;
    loadLogo().then((url) => {
      if (active) setLogoUrl(url);
    });
    return () => {
      active = false;
    };
  }, []);

  return logoUrl;
}
