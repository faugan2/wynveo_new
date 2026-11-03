import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';

// Configuration Firebase : à renseigner dans un fichier .env.local (voir .env.example).
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebase.apps.length) {
  firebase.initializeApp(config);
}

export const auth = firebase.auth();
export const db = firebase.firestore();
export const functions = firebase.app().functions('europe-west1');

// Tests en local : VITE_USE_EMULATORS=true dans .env.local lance le site contre les émulateurs
// (voir firebase.json). Aucune donnée n'est alors écrite dans le projet réel.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  auth.useEmulator('http://127.0.0.1:9099');
  db.useEmulator('127.0.0.1', 8080);
  functions.useEmulator('127.0.0.1', 5001);
}

export default firebase;
