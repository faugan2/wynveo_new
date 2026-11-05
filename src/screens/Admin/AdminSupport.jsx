import { useEffect, useState } from 'react';
import AdminShell from './AdminShell.jsx';
import { functions } from '../../lib/firebase.js';

const EMPTY = { email: '', whatsapp: '', telegram: '', hours: '', helpline: '' };

// Contacts affichés aux joueurs (Aide et support, Jeu responsable). Les valeurs vides ne sont pas affichées.
export default function AdminSupport() {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    functions
      .httpsCallable('adminGetSettings')({ name: 'support' })
      .then(({ data }) => setForm({ ...EMPTY, ...data.values }))
      .catch((err) => setError(err?.message || 'Lecture impossible.'));
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);
    try {
      await functions.httpsCallable('adminSaveSettings')({
        name: 'support',
        values: {
          email: form.email.trim(),
          whatsapp: form.whatsapp.trim(),
          telegram: form.telegram.trim(),
          hours: form.hours.trim(),
          helpline: form.helpline.trim(),
        },
      });
      setMessage('Coordonnées enregistrées. Elles apparaissent aux joueurs immédiatement.');
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell active="aide">
      <section className="admin-card">
        <h2>Aide et contacts</h2>
        <p className="admin-help">
          Ces informations sont affichées sur les pages Aide et support et Jeu responsable. Laissez un champ vide pour ne pas l’afficher.
        </p>
        {!form && !error && <p className="admin-hint">Chargement…</p>}
        {form && (
          <form className="admin-form" onSubmit={save}>
            <label>
              E-mail de support
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
            </label>
            <label>
              WhatsApp (numéro avec indicatif)
              <input type="text" value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} placeholder="+228 …" />
            </label>
            <label>
              Telegram (@nom d’utilisateur ou lien t.me)
              <input type="text" value={form.telegram} onChange={(e) => update('telegram', e.target.value)} placeholder="@wynveo" />
            </label>
            <label>
              Horaires du support
              <input type="text" value={form.hours} onChange={(e) => update('hours', e.target.value)} placeholder="Ex. : lundi au samedi, 9 h à 18 h" />
            </label>
            <label>
              Ligne d’aide au jeu responsable
              <input type="text" value={form.helpline} onChange={(e) => update('helpline', e.target.value)} placeholder="Numéro d’écoute" />
            </label>
            <div className="admin-actions">
              <button type="submit" className="admin-primary" disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
        {message && <p className="admin-ok" role="status">{message}</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </section>
    </AdminShell>
  );
}
