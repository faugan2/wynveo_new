import { db } from './firebase.js';

// Lecture d'un réglage de l'administration, directement dans wy_settings/{name}.
// Les règles Firestore limitent la lecture aux rôles qui gèrent ce réglage.
// Même forme de réponse que l'ancienne fonction adminGetSettings : { data: { name, values } }.
export function readAdminSettings(name) {
  return db
    .collection('wy_settings')
    .doc(name)
    .get()
    .then((snapshot) => ({ data: { name, values: snapshot.exists ? snapshot.data() : {} } }));
}
