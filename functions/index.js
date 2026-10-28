const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const { isValidPhone } = require('./countries');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'europe-west1';
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Clé de document : le numéro lui-même, pour garantir un numéro = un compte.
const phoneKey = (phone) => phone.replace(/\D/g, '');

// Renvoie l'e-mail du compte à partir du numéro, pour la connexion.
// Réponse neutre si le numéro est inconnu, pour ne pas révéler les comptes existants.
exports.getLoginEmail = onCall({ region: REGION }, async (request) => {
  const phone = request.data?.phone;
  if (typeof phone !== 'string' || !isValidPhone(phone)) {
    throw new HttpsError('invalid-argument', 'Numéro invalide.');
  }

  const snapshot = await db.collection('phones').doc(phoneKey(phone)).get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Numéro ou mot de passe incorrect.');
  }
  return { email: snapshot.get('email') };
});

// Crée le compte : Firebase Auth + profil users/{uid} + index phones/{numéro}, dans une transaction.
exports.registerAccount = onCall({ region: REGION }, async (request) => {
  const { fullName, phone, email, password, referralCode = '', acceptedTerms } = request.data || {};

  if (typeof fullName !== 'string' || fullName.trim().length < 2) {
    throw new HttpsError('invalid-argument', 'Le nom complet est obligatoire.');
  }
  if (typeof phone !== 'string' || !isValidPhone(phone)) {
    throw new HttpsError('invalid-argument', 'Numéro invalide.');
  }
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    throw new HttpsError('invalid-argument', 'Adresse e-mail invalide.');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpsError('invalid-argument', 'Le mot de passe doit contenir 8 caractères minimum.');
  }
  if (acceptedTerms !== true) {
    throw new HttpsError('invalid-argument', 'Vous devez confirmer avoir 18 ans ou plus.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const key = phoneKey(phone);
  const phoneRef = db.collection('phones').doc(key);

  if ((await phoneRef.get()).exists) {
    throw new HttpsError('already-exists', 'Ce numéro est déjà utilisé.');
  }

  let userRecord;
  try {
    userRecord = await getAuth().createUser({
      email: cleanEmail,
      password,
      displayName: fullName.trim(),
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Cette adresse e-mail est déjà utilisée.');
    }
    throw new HttpsError('internal', 'Création du compte impossible.');
  }

  try {
    await db.runTransaction(async (tx) => {
      // Le numéro doit rester unique même en cas de deux inscriptions simultanées.
      if ((await tx.get(phoneRef)).exists) {
        throw new HttpsError('already-exists', 'Ce numéro est déjà utilisé.');
      }
      tx.set(phoneRef, { uid: userRecord.uid, email: cleanEmail });
      tx.set(db.collection('users').doc(userRecord.uid), {
        fullName: fullName.trim(),
        phone,
        email: cleanEmail,
        referralCode: referralCode.trim().toUpperCase(),
        verified: false,
        balance: { real: 0, bonus: 0, withdrawable: 0 },
        acceptedTermsAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    // Annule la création Auth si le profil n'a pas pu être écrit.
    await getAuth().deleteUser(userRecord.uid);
    throw err instanceof HttpsError ? err : new HttpsError('internal', 'Création du compte impossible.');
  }

  return { uid: userRecord.uid };
});
