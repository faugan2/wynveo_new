import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase.js';

const AuthContext = createContext(null);

// Fournit l'utilisateur connecté et son profil (users/{uid}).
// Le champ `verified` passe à true après le premier dépôt Mobile Money.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((firebaseUser) => {
      unsubscribeProfile();
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      unsubscribeProfile = db
        .collection('users')
        .doc(firebaseUser.uid)
        .onSnapshot(
          (snapshot) => {
            setProfile(snapshot.exists ? snapshot.data() : null);
            setLoading(false);
          },
          () => setLoading(false)
        );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile();
    };
  }, []);

  const value = {
    user,
    profile,
    loading,
    isVerified: Boolean(profile?.verified),
    signOut: () => auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return context;
}
