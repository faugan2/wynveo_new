import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { db, functions } from './firebase.js';

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
    db.collection('wy_game_favorites')
      .doc(user.uid)
      .get()
      .then((snapshot) => {
        const slugs = snapshot.exists ? snapshot.get('slugs') : [];
        if (active) setFavorites(Array.isArray(slugs) ? slugs : []);
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
