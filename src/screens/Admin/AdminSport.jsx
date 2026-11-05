import { useEffect, useState } from 'react';
import {
  IoArrowUndoOutline,
  IoCheckmarkCircleOutline,
  IoCloseCircleOutline,
  IoCloseOutline,
  IoCreateOutline,
  IoPauseCircleOutline,
  IoPlayCircleOutline,
  IoAddCircleOutline,
  IoRefreshOutline,
  IoTrophyOutline,
} from 'react-icons/io5';
import AdminShell from './AdminShell.jsx';
import TablePager from '../../components/Admin/TablePager.jsx';
import { useCursorPaging } from '../../lib/adminPaging.js';
import { functions } from '../../lib/firebase.js';

const STATUS_LABELS = {
  upcoming: 'À venir',
  live: 'En cours',
  finished: 'Terminé',
  cancelled: 'Annulé',
  suspended: 'Suspendu',
};

const SOURCE_LABELS = {
  api: 'Automatique',
};

const ODDS_FIELDS = [
  { key: 'home', label: '1' },
  { key: 'draw', label: 'N' },
  { key: 'away', label: '2' },
  { key: 'over', label: 'Plus 2,5' },
  { key: 'under', label: 'Moins 2,5' },
];

function price(value) {
  return value == null ? '—' : value.toFixed(2).replace('.', ',');
}

// Matchs importés et cotes, par pages de 20, avec les actions de l'équipe trading.
export default function AdminSport() {
  const [status, setStatus] = useState('');
  const [version, setVersion] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null); // { id, action } : action en attente de confirmation et de motif
  const [editing, setEditing] = useState(null); // { id, label, values } : saisie de cotes à la main
  const [creating, setCreating] = useState(false); // fenêtre d'ajout d'un match manuel
  const [resulting, setResulting] = useState(null); // match manuel dont on saisit le résultat

  const paging = useCursorPaging(
    (cursor) =>
      functions
        .httpsCallable('adminListSportEvents')({ status, cursor, pageSize: 20 })
        .then(({ data }) => ({ items: data.events, next: data.next })),
    `${status}|${version}`
  );
  const { items: events, error: listError } = paging;

  // Exécute une action sur un match, puis recharge la liste.
  async function act(eventId, action, extra = {}) {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const { data } = await functions.httpsCallable('adminSetSportEvent')({ eventId, action, ...extra });
      const labels = {
        suspend: 'Match suspendu.',
        reopen: 'Match réactivé.',
        cancel: `Match annulé. ${data.refundedBets ?? 0} pari(s) réglé(s) et remboursé(s).`,
        setOdds: 'Cotes enregistrées.',
        clearOdds: 'Retour aux cotes automatiques au prochain import.',
        setResult: `Résultat enregistré. ${data.settledBets ?? 0} pari(s) réglé(s).`,
      };
      setMessage(labels[action] || 'Action enregistrée.');
      setConfirming(null);
      setEditing(null);
      setResulting(null);
      setReason('');
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err?.message || 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  // Crée un match manuel. Le serveur valide les équipes, la date (plus de 10 minutes dans le futur) et les cotes.
  async function createMatch(form) {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await functions.httpsCallable('adminCreateSportEvent')({
        league: form.league,
        homeTeam: form.homeTeam,
        awayTeam: form.awayTeam,
        commenceTimeMs: new Date(form.when).getTime(),
        odds: form.odds,
      });
      setMessage('Match ajouté.');
      setCreating(false);
      setVersion((v) => v + 1);
      return true;
    } catch (err) {
      setError(err?.message || 'Ajout impossible.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startOdds(event) {
    const values = {};
    ODDS_FIELDS.forEach(({ key }) => {
      values[key] = event.odds?.[key] != null ? String(event.odds[key]) : '';
    });
    setEditing({ id: event.id, label: `${event.homeTeam} – ${event.awayTeam}`, values });
  }

  function saveOdds() {
    const odds = {};
    for (const { key } of ODDS_FIELDS) {
      const value = Number(editing.values[key].replace(',', '.'));
      if (!Number.isFinite(value) || value < 1.01 || value > 1000) {
        setError('Chaque cote doit être comprise entre 1,01 et 1000.');
        return;
      }
      odds[key] = value;
    }
    act(editing.id, 'setOdds', { odds });
  }

  return (
    <AdminShell active="matchs">
      <section className="admin-card">
        <h2>Matchs et cotes</h2>
        <p className="admin-help">
          Les cotes sont importées automatiquement. Une cote saisie à la main reste en place jusqu’à ce que vous la remettiez en automatique.
        </p>

        <div className="admin-actions">
          <button type="button" className="admin-primary" onClick={() => setCreating(true)} disabled={busy}>
            <IoAddCircleOutline /> Ajouter un match
          </button>
        </div>

        <div className="admin-filters">
          <label>
            Statut
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {!events && !listError && <p className="admin-hint">Chargement…</p>}
        {events && events.length === 0 && <p className="admin-hint">Aucun match pour ce filtre.</p>}
        {events && events.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-compact">
              <thead>
                <tr>
                  <th>Coup d'envoi</th>
                  <th>Match</th>
                  <th>Statut</th>
                  <th>1</th>
                  <th>N</th>
                  <th>2</th>
                  <th>Plus 2,5</th>
                  <th>Moins 2,5</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <Row
                    key={event.id}
                    event={event}
                    busy={busy}
                    reason={reason}
                    setReason={setReason}
                    confirming={confirming}
                    setConfirming={setConfirming}
                    setResulting={setResulting}
                    startOdds={startOdds}
                    act={act}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {events && events.length > 0 && (
          <TablePager
            page={paging.page}
            hasPrev={paging.hasPrev}
            hasNext={paging.hasNext}
            loading={paging.loading}
            onPrev={paging.prev}
            onNext={paging.next}
          />
        )}
        {message && <p className="admin-ok" role="status">{message}</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
        {listError && <p className="admin-error" role="alert">{listError}</p>}
      </section>
      {confirming && (
        <ConfirmModal
          confirm={confirming}
          busy={busy}
          error={error}
          reason={reason}
          setReason={setReason}
          onConfirm={() => act(confirming.id, confirming.action, { reason: reason.trim() })}
          onClose={() => setConfirming(null)}
        />
      )}
      {creating && <CreateMatchModal busy={busy} error={error} onCreate={createMatch} onClose={() => setCreating(false)} />}
      {resulting && (
        <ResultModal
          event={resulting}
          busy={busy}
          error={error}
          onSave={(homeScore, awayScore) => act(resulting.id, 'setResult', { homeScore, awayScore })}
          onClose={() => setResulting(null)}
        />
      )}
      {editing && (
        <OddsModal
          editing={editing}
          busy={busy}
          error={error}
          setEditing={setEditing}
          onSave={saveOdds}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminShell>
  );
}

// Confirmation de suspension ou d'annulation d'un match, avec le motif obligatoire.
const CONFIRM_TEXT = {
  suspend: { title: 'Suspendre le match', question: 'Il ne recevra plus de paris tant qu’il n’est pas réactivé.', button: 'Suspendre' },
  cancel: { title: 'Annuler le match', question: 'Les paris qui le concernent seront remboursés.', button: 'Annuler le match' },
};

function ConfirmModal({ confirm, busy, error, reason, setReason, onConfirm, onClose }) {
  const text = CONFIRM_TEXT[confirm.action];
  const reasonOk = reason.trim().length >= 3;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="admin-modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <h3 id="confirm-modal-title">{text.title}</h3>
          <button type="button" className="admin-modal-close" aria-label="Fermer" onClick={onClose} disabled={busy}>
            <IoCloseOutline />
          </button>
        </div>
        <p className="admin-sub">{confirm.label}</p>
        <p className="admin-help">{text.question}</p>
        <label className="admin-modal-field">
          <span>Motif (3 caractères minimum)</span>
          <input
            type="text"
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex. : match reporté, erreur de cote"
            autoFocus
          />
        </label>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <div className="admin-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            <IoArrowUndoOutline /> Retour
          </button>
          <button type="button" className="admin-danger" disabled={busy || !reasonOk} onClick={onConfirm}>
            <IoCheckmarkCircleOutline /> {busy ? 'Enregistrement…' : text.button}
          </button>
        </div>
      </div>
    </div>
  );
}

// Fenêtre d'ajout d'un match manuel : championnat, équipes, date, cotes.
function CreateMatchModal({ busy, error, onCreate, onClose }) {
  const [form, setForm] = useState({
    league: 'Match manuel',
    homeTeam: '',
    awayTeam: '',
    when: '',
    odds: { home: '', draw: '', away: '', over: '', under: '' },
  });
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setOdd = (key, value) => setForm((current) => ({ ...current, odds: { ...current.odds, [key]: value } }));

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  function submit(event) {
    event.preventDefault();
    const odds = {};
    for (const { key } of ODDS_FIELDS) {
      const value = Number(String(form.odds[key]).replace(',', '.'));
      odds[key] = Number.isFinite(value) ? value : NaN;
    }
    onCreate({ ...form, odds });
  }

  return (
    <div className="admin-modal-backdrop" onClick={() => !busy && onClose()}>
      <form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="create-modal-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-head">
          <h3 id="create-modal-title">Ajouter un match</h3>
          <button type="button" className="admin-modal-close" aria-label="Fermer" onClick={onClose} disabled={busy}>
            <IoCloseOutline />
          </button>
        </div>
        <label className="admin-modal-field">
          <span>Championnat</span>
          <input type="text" maxLength={60} value={form.league} onChange={(e) => set('league', e.target.value)} />
        </label>
        <div className="admin-modal-grid">
          <label className="admin-modal-field">
            <span>Équipe domicile</span>
            <input type="text" maxLength={60} value={form.homeTeam} onChange={(e) => set('homeTeam', e.target.value)} required />
          </label>
          <label className="admin-modal-field">
            <span>Équipe extérieur</span>
            <input type="text" maxLength={60} value={form.awayTeam} onChange={(e) => set('awayTeam', e.target.value)} required />
          </label>
        </div>
        <label className="admin-modal-field">
          <span>Coup d’envoi</span>
          <input type="datetime-local" value={form.when} onChange={(e) => set('when', e.target.value)} required />
        </label>
        <div className="admin-modal-grid">
          {ODDS_FIELDS.map(({ key, label }) => (
            <label key={key} className="admin-modal-field">
              <span>Cote {label}</span>
              <input type="text" inputMode="decimal" value={form.odds[key]} onChange={(e) => setOdd(key, e.target.value)} required />
            </label>
          ))}
        </div>
        <p className="admin-help">Le match est visible et pariable jusqu’au coup d’envoi. Son résultat devra être saisi après le match.</p>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <div className="admin-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="submit" className="admin-primary" disabled={busy}>
            {busy ? 'Ajout…' : 'Ajouter le match'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Fenêtre de saisie du résultat d'un match manuel, après le coup d'envoi.
function ResultModal({ event, busy, error, onSave, onClose }) {
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const valid = /^\d+$/.test(home) && /^\d+$/.test(away);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="admin-modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="result-modal-title" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head">
          <h3 id="result-modal-title">Résultat du match</h3>
          <button type="button" className="admin-modal-close" aria-label="Fermer" onClick={onClose} disabled={busy}>
            <IoCloseOutline />
          </button>
        </div>
        <p className="admin-sub">{event.homeTeam} – {event.awayTeam}</p>
        <div className="admin-modal-grid">
          <label className="admin-modal-field">
            <span>{event.homeTeam}</span>
            <input type="text" inputMode="numeric" value={home} onChange={(e) => setHome(e.target.value)} />
          </label>
          <label className="admin-modal-field">
            <span>{event.awayTeam}</span>
            <input type="text" inputMode="numeric" value={away} onChange={(e) => setAway(e.target.value)} />
          </label>
        </div>
        <p className="admin-help">Les paris de ce match sont réglés dès l’enregistrement du résultat, selon les cotes choisies au moment du pari.</p>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <div className="admin-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="admin-primary" disabled={busy || !valid} onClick={() => onSave(Number(home), Number(away))}>
            {busy ? 'Enregistrement…' : 'Enregistrer le résultat'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Fenêtre de saisie des cotes à la main : un champ par issue, fermeture par Échap ou par clic à côté.
function OddsModal({ editing, busy, error, setEditing, onSave, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="admin-modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="odds-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <h3 id="odds-modal-title">Cotes à la main</h3>
          <button type="button" className="admin-modal-close" aria-label="Fermer" onClick={onClose} disabled={busy}>
            <IoCloseOutline />
          </button>
        </div>
        <p className="admin-sub">{editing.label}</p>

        <div className="admin-modal-grid">
          {ODDS_FIELDS.map(({ key, label }) => (
            <label key={key} className="admin-modal-field">
              <span>{label}</span>
              <input
                type="text"
                inputMode="decimal"
                value={editing.values[key]}
                onChange={(event) => setEditing({ ...editing, values: { ...editing.values, [key]: event.target.value } })}
              />
            </label>
          ))}
        </div>

        <p className="admin-help">
          Chaque cote doit être comprise entre 1,01 et 1000. Elle reste en place jusqu’à ce que vous remettiez les cotes automatiques.
        </p>
        {error && <p className="admin-error" role="alert">{error}</p>}

        <div className="admin-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="admin-primary" onClick={onSave} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer les cotes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ event, busy, reason, setReason, confirming, setConfirming, setResulting, startOdds, act }) {
  const confirmingHere = confirming && confirming.id === event.id ? confirming : null;
  const canResult = event.manual && ['upcoming', 'suspended', 'live'].includes(event.status) && event.commenceTime <= Date.now();
  const reasonOk = reason.trim().length >= 3;
  const canSuspend = event.status === 'upcoming';
  const canReopen = event.status === 'suspended';
  const canCancel = event.status === 'upcoming' || event.status === 'suspended';
  const canOdds = event.status === 'upcoming';

  // Ouvre la confirmation d'une action : le motif est saisi là, et vidé d'abord.
  function openConfirm(action) {
    setReason('');
    setConfirming({ id: event.id, action, label: `${event.homeTeam} – ${event.awayTeam}` });
  }

  return (
    <>
      <tr>
        <td>{event.commenceTime ? new Date(event.commenceTime).toLocaleString('fr-FR') : '—'}</td>
        <td>
          {event.homeTeam} – {event.awayTeam}
          <small className="admin-sub">{event.league}</small>
        </td>
        <td>{STATUS_LABELS[event.status] || event.status}</td>
        <td>{price(event.odds?.home)}</td>
        <td>{price(event.odds?.draw)}</td>
        <td>{price(event.odds?.away)}</td>
        <td>{price(event.odds?.over)}</td>
        <td>{price(event.odds?.under)}</td>
        <td>
          {event.manualOdds ? 'Manuelle' : SOURCE_LABELS[event.oddsSource] || '—'}
          {event.oddsUpdatedAt ? <small className="admin-sub">{new Date(event.oddsUpdatedAt).toLocaleString('fr-FR')}</small> : null}
        </td>
        <td>
          <div className="admin-table-actions">
            {canSuspend && (
              <button
                type="button"
                title="Suspendre"
                aria-label="Suspendre"
                disabled={busy || Boolean(confirmingHere)}
                onClick={() => openConfirm('suspend')}
              >
                <IoPauseCircleOutline />
              </button>
            )}
            {canReopen && (
              <button type="button" title="Réactiver" aria-label="Réactiver" disabled={busy} onClick={() => act(event.id, 'reopen')}>
                <IoPlayCircleOutline />
              </button>
            )}
            {canOdds && (
              <button type="button" title="Saisir les cotes à la main" aria-label="Saisir les cotes à la main" disabled={busy} onClick={() => startOdds(event)}>
                <IoCreateOutline />
              </button>
            )}
            {event.manualOdds && (
              <button type="button" title="Remettre les cotes automatiques" aria-label="Remettre les cotes automatiques" disabled={busy} onClick={() => act(event.id, 'clearOdds')}>
                <IoRefreshOutline />
              </button>
            )}
            {canResult && (
              <button type="button" title="Saisir le résultat" aria-label="Saisir le résultat" disabled={busy} onClick={() => setResulting(event)}>
                <IoTrophyOutline />
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className="is-danger"
                title="Annuler le match"
                aria-label="Annuler le match"
                disabled={busy || Boolean(confirmingHere)}
                onClick={() => openConfirm('cancel')}
              >
                <IoCloseCircleOutline />
              </button>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}
