import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mot de passe oublié : un lien de réinitialisation est envoyé à l'e-mail du compte.
// Le message est identique que le compte existe ou non.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = EMAIL_PATTERN.test(email.trim()) && !submitting;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSubmitting(true);
    try {
      await auth.sendPasswordResetEmail(email.trim());
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') {
        setError('Envoi impossible. Réessayez plus tard.');
        setSubmitting(false);
        return;
      }
    }
    setSent(true);
    setSubmitting(false);
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <button type="button" className="back-button" onClick={() => navigate(-1)} aria-label="Retour">
          ‹
        </button>
        <h1 className="title-font" style={{ fontSize: 26, margin: 0 }}>Mot de passe oublié</h1>
      </div>

      {sent ? (
        <p style={{ color: 'var(--text-muted)' }}>
          Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Entrez l'adresse e-mail de votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de passe.
          </p>
          <label className="field-label" htmlFor="email">Adresse e-mail</label>
          <div className="field">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ marginTop: 24 }} disabled={!canSubmit}>
            {submitting ? 'Envoi…' : 'Envoyer le lien'}
          </button>
        </form>
      )}
    </main>
  );
}
