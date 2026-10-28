import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, functions } from '../lib/firebase.js';
import { DEFAULT_COUNTRY, buildPhone } from '../config/countries.js';
import PhoneInput from '../components/PhoneInput.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

// Écran 02 : Connexion. Le numéro sert d'identifiant ; l'e-mail réel est retrouvé côté serveur.
export default function Login() {
  const navigate = useNavigate();
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const phone = buildPhone(country, localPhone);
  const canSubmit = Boolean(phone) && password.length > 0 && !submitting;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSubmitting(true);
    try {
      const { data } = await functions.httpsCallable('getLoginEmail')({ phone });
      await auth.signInWithEmailAndPassword(data.email, password);
      navigate('/home', { replace: true });
    } catch {
      // Message volontairement générique : on ne révèle pas si le numéro existe.
      setError('Numéro ou mot de passe incorrect.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <button type="button" className="back-button" onClick={() => navigate(-1)} aria-label="Retour">
          ‹
        </button>
        <h1 className="title-font" style={{ fontSize: 26, margin: 0 }}>Connexion</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Heureux de vous revoir. Entrez votre numéro et votre mot de passe.
        </p>

        <label className="field-label" htmlFor="phone">Numéro de téléphone</label>
        <PhoneInput
          country={country}
          onCountryChange={setCountry}
          value={localPhone}
          onChange={setLocalPhone}
          autoFocus
        />

        <label className="field-label" htmlFor="password">Mot de passe</label>
        <PasswordInput value={password} onChange={setPassword} placeholder="••••••••" />

        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <Link to="/forgot-password" className="link">Mot de passe oublié ?</Link>
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <button type="submit" className="btn btn-primary" style={{ marginTop: 24 }} disabled={!canSubmit}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 'auto', paddingBottom: 24, fontSize: 14, color: 'var(--text-muted)' }}>
        Pas encore de compte ? <Link to="/register" className="link">Créer un compte</Link>
      </p>
    </main>
  );
}
