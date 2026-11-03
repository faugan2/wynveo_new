import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, functions } from '../lib/firebase.js';
import { DEFAULT_COUNTRY, buildPhone } from '../config/countries.js';
import PhoneInput from '../components/PhoneInput.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Écran 03 : Inscription en deux étapes.
// Étape 1 (Identité) : nom, numéro, e-mail. Étape 2 (Sécurité) : mot de passe, parrain, 18 ans.
// Le compte est créé tout de suite à la fin, sans code à saisir.
export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
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
  const identityOk = fullName.trim().length > 0 && Boolean(phone) && EMAIL_PATTERN.test(email.trim());
  const passwordOk = password.length >= MIN_PASSWORD_LENGTH;
  const canCreate = identityOk && passwordOk && acceptedTerms && !submitting;

  function goToSecurity(event) {
    event.preventDefault();
    if (identityOk) {
      setError('');
      setStep(2);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!canCreate) return;

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
      setSubmitting(false);
    }
  }

  function handleBack() {
    if (step === 2) {
      setError('');
      setStep(1);
    } else {
      navigate(-1);
    }
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <button type="button" className="back-button" onClick={handleBack} aria-label="Retour">
          ‹
        </button>
        <h1 className="title-font" style={{ fontSize: 26, margin: 0 }}>Inscription</h1>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
        ÉTAPE {step} SUR 2 · {step === 1 ? 'IDENTITÉ' : 'SÉCURITÉ'}
      </div>
      <div className="step-progress" aria-hidden="true">
        <span style={{ width: step === 1 ? '50%' : '100%' }} />
      </div>

      {step === 1 && (
        <form onSubmit={goToSecurity} style={{ paddingBottom: 24 }}>
          <label className="field-label" htmlFor="fullName">Nom complet</label>
          <div className="field">
            <input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex : Kossi Amouzou"
              autoComplete="name"
              autoFocus
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

          <button type="submit" className="btn btn-primary" style={{ marginTop: 24 }} disabled={!identityOk}>
            Continuer
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleCreate} style={{ paddingBottom: 24 }}>
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

          <button type="submit" className="btn btn-primary" style={{ marginTop: 24 }} disabled={!canCreate}>
            {submitting ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>
      )}

      <p style={{ textAlign: 'center', paddingBottom: 24, fontSize: 14, color: 'var(--text-muted)', marginTop: 'auto' }}>
        Déjà un compte ? <Link to="/login" className="link">Se connecter</Link>
      </p>
    </main>
  );
}
