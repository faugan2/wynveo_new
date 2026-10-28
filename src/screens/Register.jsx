import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, functions } from '../lib/firebase.js';
import { DEFAULT_COUNTRY, buildPhone } from '../config/countries.js';
import PhoneInput from '../components/PhoneInput.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Écran 03 : Inscription. Le compte est créé tout de suite, sans code à saisir.
// La création est faite côté serveur (numéro et e-mail uniques).
export default function Register() {
  const navigate = useNavigate();
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [fullName, setFullName] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const phone = buildPhone(country, localPhone);
  const passwordOk = password.length >= MIN_PASSWORD_LENGTH;
  const emailOk = EMAIL_PATTERN.test(email.trim());
  const canSubmit =
    fullName.trim().length > 0 && Boolean(phone) && emailOk && passwordOk && acceptedTerms && !submitting;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSubmitting(true);
    try {
      await functions.httpsCallable('registerAccount')({
        fullName: fullName.trim(),
        phone,
        email: email.trim(),
        password,
        referralCode: referralCode.trim().toUpperCase(),
        acceptedTerms,
      });
      await auth.signInWithEmailAndPassword(email.trim(), password);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err?.message || 'Inscription impossible. Réessayez.');
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
        <h1 className="title-font" style={{ fontSize: 26, margin: 0 }}>Inscription</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ paddingBottom: 24 }}>
        <label className="field-label" htmlFor="fullName">Nom complet</label>
        <div className="field">
          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ex : Kossi Amouzou"
            autoComplete="name"
          />
        </div>

        <label className="field-label" htmlFor="phone">Numéro de téléphone</label>
        <PhoneInput country={country} onCountryChange={setCountry} value={localPhone} onChange={setLocalPhone} />

        <label className="field-label" htmlFor="email">Adresse e-mail</label>
        <div className="field">
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            autoComplete="email"
          />
        </div>
        <p className="hint">Sert à récupérer votre mot de passe.</p>

        <label className="field-label" htmlFor="password">Mot de passe</label>
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="8 caractères minimum"
          autoComplete="new-password"
        />
        {passwordOk && <p className="hint hint-ok">✓ 8 caractères minimum</p>}

        <label className="field-label" htmlFor="referral">
          Code parrain <span style={{ color: 'var(--purple)', fontWeight: 500 }}>(facultatif)</span>
        </label>
        <div className="field">
          <input
            id="referral"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
            placeholder="Ex : KOSSI228"
          />
        </div>

        <label className="legal-check">
          <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
          <span>
            J'ai 18 ans ou plus et j'accepte les <span style={{ color: 'var(--text-link)' }}>conditions d'utilisation</span>.
          </span>
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <button type="submit" className="btn btn-primary" style={{ marginTop: 24 }} disabled={!canSubmit}>
          {submitting ? 'Création…' : 'Continuer'}
        </button>
      </form>

      <p style={{ textAlign: 'center', paddingBottom: 24, fontSize: 14, color: 'var(--text-muted)', marginTop: 'auto' }}>
        Déjà un compte ? <Link to="/login" className="link">Se connecter</Link>
      </p>
    </main>
  );
}
