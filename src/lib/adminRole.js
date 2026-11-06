import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { db } from './firebase.js';

// Rôle d'administration du compte connecté (null pour un membre ou un visiteur).
// Lu directement dans wy_admins/{uid} : les règles Firestore n'autorisent que la lecture de son propre document.
export function useMyAdminRole() {
  const { user } = useAuth();
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return undefined;
    }
    let active = true;
    db.collection('wy_admins')
      .doc(user.uid)
      .get()
      .then((snapshot) => {
        const value = snapshot.exists ? snapshot.get('role') : null;
        if (active) setRole(typeof value === 'string' ? value : null);
      })
      .catch(() => {
        if (active) setRole(null);
      });
    return () => {
      active = false;
    };
  }, [user]);

  return role;
}
