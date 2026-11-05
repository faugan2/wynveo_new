import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { functions } from './firebase.js';

// Jeux favoris du membre connecté, lus et écrits sur le serveur (compte, tous appareils).
// Visiteur : liste vide et aucune écriture.
export function useGameFavorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return undefined;
    }
    let active = true;
    functions
      .httpsCallable('getGameFavorites')({})
      .then(({ data }) => {
        if (active) setFavorites(Array.isArray(data.slugs) ? data.slugs : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  // Mise à jour immédiate à l'écran ; en cas d'échec, la liste revient à son état précédent.
  function toggle(slug, saved) {
    const previous = favorites;
    setFavorites(saved ? [...new Set([...favorites, slug])] : favorites.filter((item) => item !== slug));
    functions.httpsCallable('setGameFavorite')({ slug, saved }).catch(() => setFavorites(previous));
  }

  return { favorites, enabled: Boolean(user), toggle };
}
