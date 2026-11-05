import { useEffect, useState } from 'react';
import { functions } from './firebase.js';

// Logo de l'application (réglé dans l'admin). Une seule lecture par chargement, gardée en mémoire.
// Renvoie une chaîne vide tant que le logo n'est pas connu ou s'il n'y en a pas : l'en-tête affiche alors le texte.
let logoPromise = null;

function loadLogo() {
  if (!logoPromise) {
    logoPromise = functions
      .httpsCallable('getBranding')({})
      .then(({ data }) => (typeof data.logoUrl === 'string' ? data.logoUrl : ''))
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
