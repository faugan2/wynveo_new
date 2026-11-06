import { useEffect, useState } from 'react';
import AdminShell from './AdminShell.jsx';
import { functions } from '../../lib/firebase.js';
import { readAdminSettings } from '../../lib/adminSettings.js';

// Réglages des dépôts crypto (wy_settings/payments).
export default function AdminPayments() {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    readAdminSettings('payments')
      .then(({ data }) => setForm({ adminAddress: '', rateXofPerUsd: 600, minDepositXof: 1000, expiryMinutes: 30, ...data.values }))
      .catch((err) => setError(err?.message || 'Lecture impossible.'));
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await functions.httpsCallable('adminSaveSettings')({
        name: 'payments',
        values: {
          adminAddress: form.adminAddress.trim(),
          rateXofPerUsd: Number(form.rateXofPerUsd),
          minDepositXof: Number(form.minDepositXof),
          expiryMinutes: Number(form.expiryMinutes),
        },
      });
      setMessage('Réglages enregistrés.');
    } catch (err) {
      setError(err?.message || "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell active="paiements">
      <section className="admin-card">
        <h2>Dépôts crypto</h2>
        <p className="admin-help">Ces réglages s'appliquent immédiatement aux nouvelles demandes de dépôt.</p>
        {!form && !error && <p className="admin-hint">Chargement…</p>}
        {form && (
          <form className="admin-form" onSubmit={save}>
            <label>
              Adresse de réception (0x…)
              <input value={form.adminAddress} onChange={(e) => update('adminAddress', e.target.value)} spellCheck={false} />
            </label>
            <label>
              Taux (FCFA pour 1 USD)
              <input type="number" min="1" value={form.rateXofPerUsd} onChange={(e) => update('rateXofPerUsd', e.target.value)} />
            </label>
            <label>
              Dépôt minimum (FCFA)
              <input type="number" min="1" step="1" value={form.minDepositXof} onChange={(e) => update('minDepositXof', e.target.value)} />
            </label>
            <label>
              Durée de validité d'une demande (minutes)
              <input type="number" min="5" max="240" value={form.expiryMinutes} onChange={(e) => update('expiryMinutes', e.target.value)} />
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
