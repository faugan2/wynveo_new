import { useState } from 'react';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import TablePager from '../components/Admin/TablePager.jsx';
import { useCursorPaging } from '../lib/adminPaging.js';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';

// Historique paginé : dépôts, bonus de parrainage, paris et gains du compte connecté, par pages de 20.
const FILTERS = [
  { key: '', label: 'Tout' },
  { key: 'deposit', label: 'Dépôts' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'bet', label: 'Paris' },
];

export default function History() {
  const [type, setType] = useState('');
  // Le filtre est appliqué par le serveur : changer de filtre repart à la première page.
  const paging = useCursorPaging(
    (cursor) =>
      functions
        .httpsCallable('getMyOperationsPage')({ type, cursor, pageSize: 20 })
        .then(({ data }) => ({ items: data.operations, next: data.next })),
    `history|${type}`
  );
  const { items: operations, error } = paging;

  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">Historique</h1>

      <div className="history-filters" role="tablist" aria-label="Type d'opération">
        {FILTERS.map((filter) => (
          <button
            key={filter.key || 'all'}
            type="button"
            role="tab"
            aria-selected={type === filter.key}
            className={`filter-pill${type === filter.key ? ' is-active' : ''}`}
            onClick={() => setType(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!operations && !error && <p className="hint">Chargement…</p>}
      {operations && operations.length === 0 && <p className="note">Aucune opération pour le moment.</p>}
      {operations && operations.length > 0 && (
        <ul className="op-list">
          {operations.map((op) => (
            <li key={`${op.label}-${op.id}`} className="op-item">
              <div>
                <strong>{op.label}</strong>
                <small>
                  {op.createdAt
                    ? new Date(op.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                    : 'En cours'}
                </small>
              </div>
              <b className={op.amount >= 0 ? 'positive' : 'negative'}>
                {op.amount >= 0 ? '+' : '−'}
                {formatFcfa(Math.abs(op.amount), { unit: false })}
              </b>
            </li>
          ))}
        </ul>
      )}
      {operations && operations.length > 0 && (
        <div className="history-pager">
          <TablePager
          page={paging.page}
          hasPrev={paging.hasPrev}
          hasNext={paging.hasNext}
          loading={paging.loading}
          onPrev={paging.prev}
          onNext={paging.next}
          />
        </div>
      )}
    </ConnectedLayout>
  );
}
