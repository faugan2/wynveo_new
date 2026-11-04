import { useEffect, useState } from 'react';
import AdminShell from './AdminShell.jsx';
import { functions } from '../../lib/firebase.js';

const GAMES = [
  { key: 'lucky-spin', label: 'Lucky Spin' },
  { key: 'mystery-box', label: 'Mystery Box' },
  { key: 'lucky-number', label: 'Lucky Number' },
  { key: 'jackpot', label: 'Jackpot' },
  { key: 'crash', label: 'Crash' },
];

// Valeurs par défaut affichées tant que le réglage n'existe pas encore dans Firestore.
const DEFAULTS = {
  'lucky-spin': {
    minStake: 100,
    maxStake: 10000,
    segments: [
      { multiplier: 2, weight: 300 },
      { multiplier: 5, weight: 50 },
      { multiplier: 10, weight: 20 },
      { multiplier: 50, weight: 10 },
      { multiplier: 1, weight: 3980 },
      { multiplier: 0.5, weight: 5320 },
      { multiplier: 10, weight: 20 },
      { multiplier: 2, weight: 300 },
    ],
  },
  'mystery-box': {
    minStake: 100,
    maxStake: 10000,
    outcomes: [
      { multiplier: 0, weight: 315 },
      { multiplier: 0.5, weight: 350 },
      { multiplier: 1, weight: 155 },
      { multiplier: 2, weight: 120 },
      { multiplier: 3, weight: 40 },
      { multiplier: 10, weight: 20 },
    ],
  },
  'lucky-number': { minStake: 100, maxStake: 1000, jackpotAmount: 1000000, multipliers: { 2: 2, 3: 10, 4: 100 } },
  jackpot: { ticketPrice: 1000, potShare: 0.8 },
  crash: { enabled: true, minStake: 100, maxStake: 10000, bettingSeconds: 10, growthRate: 0.06, houseRtp: 0.9, maxMultiplier: 100, maxExposurePerRound: 5000000 },
};

const num = (value) => Number(value);

// Pour chaque jeu : champs éditables et conversion vers le format attendu par le serveur.
function FieldInput({ label, value, onChange, step }) {
  return (
    <label>
      {label}
      <input type="number" step={step || 'any'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function AdminGames() {
  const [game, setGame] = useState('lucky-spin');
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(null);
    setMessage('');
    setError('');
    functions
      .httpsCallable('adminGetSettings')({ name: game })
      .then(({ data }) => setForm({ ...DEFAULTS[game], ...data.values }))
      .catch((err) => setError(err?.message || 'Lecture impossible.'));
  }, [game]);

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  // Met à jour une case de la roue (multiplicateur ou poids).
  const setSegment = (index, field, value) =>
    setForm((current) => ({
      ...current,
      segments: current.segments.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));

  const setOutcome = (index, field, value) =>
    setForm((current) => ({
      ...current,
      outcomes: current.outcomes.map((o, i) => (i === index ? { ...o, [field]: value } : o)),
    }));

  function toValues() {
    if (game === 'lucky-spin') {
      return {
        minStake: num(form.minStake),
        maxStake: num(form.maxStake),
        segments: form.segments.map((s) => ({ multiplier: num(s.multiplier), weight: num(s.weight) })),
      };
    }
    if (game === 'mystery-box') {
      return {
        minStake: num(form.minStake),
        maxStake: num(form.maxStake),
        outcomes: form.outcomes.map((o) => ({ multiplier: num(o.multiplier), weight: num(o.weight) })),
      };
    }
    if (game === 'lucky-number') {
      return {
        minStake: num(form.minStake),
        maxStake: num(form.maxStake),
        jackpotAmount: num(form.jackpotAmount),
        multipliers: Object.fromEntries(Object.entries(form.multipliers).map(([k, v]) => [k, num(v)])),
      };
    }
    if (game === 'jackpot') {
      return { ticketPrice: num(form.ticketPrice), potShare: num(form.potShare) };
    }
    return {
      enabled: Boolean(form.enabled),
      minStake: num(form.minStake),
      maxStake: num(form.maxStake),
      bettingSeconds: num(form.bettingSeconds),
      growthRate: num(form.growthRate),
      houseRtp: num(form.houseRtp),
      maxMultiplier: num(form.maxMultiplier),
      maxExposurePerRound: num(form.maxExposurePerRound),
    };
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await functions.httpsCallable('adminSaveSettings')({ name: game, values: toValues() });
      setMessage('Réglages enregistrés.');
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  // Total des poids de la roue : sa part de probabilité doit être visible pour l'admin.
  const wheelTotal = form?.segments ? form.segments.reduce((sum, s) => sum + num(s.weight || 0), 0) : 0;

  return (
    <AdminShell active="jeux">
      <div className="admin-tabs" role="tablist">
        {GAMES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={game === item.key}
            className={game === item.key ? 'is-active' : ''}
            onClick={() => setGame(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="admin-card">
        {!form && !error && <p className="admin-hint">Chargement…</p>}
        {form && (
          <form className="admin-form" onSubmit={save}>
            {(game === 'lucky-spin' || game === 'mystery-box' || game === 'lucky-number' || game === 'crash') && (
              <div className="admin-row">
                <FieldInput label="Mise minimum (FCFA)" value={form.minStake} onChange={(v) => set('minStake', v)} step="1" />
                <FieldInput label="Mise maximum (FCFA)" value={form.maxStake} onChange={(v) => set('maxStake', v)} step="1" />
              </div>
            )}

            {game === 'lucky-spin' && (
              <>
                <h3>Segments de la roue</h3>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Multiplicateur</th>
                      <th>Poids</th>
                      <th>Probabilité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.segments.map((s, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>
                          <input type="number" step="0.01" value={s.multiplier} onChange={(e) => setSegment(i, 'multiplier', e.target.value)} />
                        </td>
                        <td>
                          <input type="number" step="1" value={s.weight} onChange={(e) => setSegment(i, 'weight', e.target.value)} />
                        </td>
                        <td>{wheelTotal > 0 ? `${((num(s.weight) / wheelTotal) * 100).toFixed(2)} %` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="admin-help">Les probabilités sont calculées à partir des poids : elles totalisent toujours 100 %.</p>
              </>
            )}

            {game === 'mystery-box' && (
              <>
                <h3>Issues des coffres</h3>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Multiplicateur</th>
                      <th>Poids</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.outcomes.map((o, i) => (
                      <tr key={i}>
                        <td>
                          <input type="number" step="0.01" value={o.multiplier} onChange={(e) => setOutcome(i, 'multiplier', e.target.value)} />
                        </td>
                        <td>
                          <input type="number" step="1" value={o.weight} onChange={(e) => setOutcome(i, 'weight', e.target.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {game === 'lucky-number' && (
              <div className="admin-row">
                <FieldInput label="Gros lot à 5 bons numéros (FCFA)" value={form.jackpotAmount} onChange={(v) => set('jackpotAmount', v)} step="1" />
                <FieldInput label="Multiplicateur à 2 bons" value={form.multipliers['2']} onChange={(v) => set('multipliers', { ...form.multipliers, 2: v })} />
                <FieldInput label="Multiplicateur à 3 bons" value={form.multipliers['3']} onChange={(v) => set('multipliers', { ...form.multipliers, 3: v })} />
                <FieldInput label="Multiplicateur à 4 bons" value={form.multipliers['4']} onChange={(v) => set('multipliers', { ...form.multipliers, 4: v })} />
              </div>
            )}

            {game === 'jackpot' && (
              <div className="admin-row">
                <FieldInput label="Prix du ticket (FCFA)" value={form.ticketPrice} onChange={(v) => set('ticketPrice', v)} step="1" />
                <FieldInput label="Part vers la cagnotte (0 à 1)" value={form.potShare} onChange={(v) => set('potShare', v)} step="0.01" />
              </div>
            )}

            {game === 'crash' && (
              <>
                <label className="admin-check">
                  <input type="checkbox" checked={Boolean(form.enabled)} onChange={(e) => set('enabled', e.target.checked)} />
                  Jeu activé
                </label>
                <div className="admin-row">
                  <FieldInput label="Durée de la phase de mise (s)" value={form.bettingSeconds} onChange={(v) => set('bettingSeconds', v)} step="1" />
                  <FieldInput label="Vitesse de la courbe" value={form.growthRate} onChange={(v) => set('growthRate', v)} step="0.01" />
                  <FieldInput label="Retour au joueur (0,5 à 0,99)" value={form.houseRtp} onChange={(v) => set('houseRtp', v)} step="0.01" />
                  <FieldInput label="Plafond du multiplicateur" value={form.maxMultiplier} onChange={(v) => set('maxMultiplier', v)} step="1" />
                  <FieldInput label="Exposition maximale par manche (FCFA)" value={form.maxExposurePerRound} onChange={(v) => set('maxExposurePerRound', v)} step="1" />
                </div>
              </>
            )}

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
