import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import TablePager from '../components/Admin/TablePager.jsx';
import { useCursorPaging } from '../lib/adminPaging.js';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';

const SPORT_STATUS = {
  open: { label: 'En cours', tone: 'is-open' },
  won: { label: 'Gagné', tone: 'is-won' },
  cashed: { label: 'Gagné', tone: 'is-won' },
  lost: { label: 'Perdu', tone: 'is-lost' },
  void: { label: 'Remboursé', tone: 'is-void' },
};

const GAME_STATUS = {
  open: { label: 'En cours', tone: 'is-open' },
  won: { label: 'Gagné', tone: 'is-won' },
  lost: { label: 'Perdu', tone: 'is-lost' },
  void: { label: 'Remboursé', tone: 'is-void' },
};

const SPORT_FILTERS = [
  { key: 'open', label: 'En cours' },
  { key: 'won', label: 'Gagnés' },
  { key: 'lost', label: 'Perdus' },
  { key: 'all', label: 'Tous' },
];

const GAME_FILTERS = [
  { key: 'open', label: 'En cours' },
  { key: 'won', label: 'Gagnés' },
  { key: 'lost', label: 'Perdus' },
  { key: 'all', label: 'Tous' },
];

// Libellé du jour d'un pari : « Aujourd'hui », « Hier », ou la date.
function dayLabel(ms) {
  const date = new Date(ms);
  if (date.toDateString() === new Date().toDateString()) return "Aujourd'hui";
  if (date.toDateString() === new Date(Date.now() - 24 * 3600 * 1000).toDateString()) return 'Hier';
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Mes paris : onglets Jeux et Sport, filtres par statut, résumé du jour (jeux).
export default function MyBets() {
  const [tab, setTab] = useState('games');
  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">Mes paris</h1>
      <div className="segmented" role="tablist" aria-label="Type de paris">
        <button type="button" role="tab" aria-selected={tab === 'games'} className={tab === 'games' ? 'is-active' : ''} onClick={() => setTab('games')}>
          Jeux
        </button>
        <button type="button" role="tab" aria-selected={tab === 'sport'} className={tab === 'sport' ? 'is-active' : ''} onClick={() => setTab('sport')}>
          Sport
        </button>
      </div>
      {tab === 'games' ? <GameBets /> : <SportBetList />}
    </ConnectedLayout>
  );
}

function Chips({ filters, value, onChange }) {
  return (
    <div className="history-filters" role="tablist" aria-label="Statut">
      {filters.map((filter) => (
        <button
          key={filter.key}
          type="button"
          role="tab"
          aria-selected={value === filter.key}
          className={`filter-pill${value === filter.key ? ' is-active' : ''}`}
          onClick={() => onChange(filter.key)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

// Paris de jeux : résumé du jour, liste paginée, groupée par jour.
function GameBets() {
  const [status, setStatus] = useState('all');
  const [today, setToday] = useState(null);
  const paging = useCursorPaging(
    (cursor) =>
      functions
        .httpsCallable('getMyGameBets')({ status: status === 'all' ? '' : status, cursor, pageSize: 20 })
        .then(({ data }) => {
          if (!cursor) setToday(data.today);
          return { items: data.bets, next: data.next };
        }),
    `games|${status}`
  );
  const { items: bets, error } = paging;

  const groups = [];
  for (const bet of bets || []) {
    const label = dayLabel(bet.createdAt);
    let group = groups.find((item) => item.label === label);
    if (!group) {
      group = { label, bets: [] };
      groups.push(group);
    }
    group.bets.push(bet);
  }

  const bilan = today ? today.payout - today.stake : null;

  return (
    <div className="mybets-stack">
      {today && (
        <section className="wallet-card" aria-label="Résumé du jour">
          <small>Aujourd'hui</small>
          <div className="summary-row"><span>Misé</span><b>{formatFcfa(today.stake)}</b></div>
          <div className="summary-row"><span>Gagné</span><b className="positive">{formatFcfa(today.payout)}</b></div>
          <div className="summary-row">
            <span>Bilan</span>
            <b className={bilan >= 0 ? 'positive' : 'negative'}>{bilan >= 0 ? '+' : '−'}{formatFcfa(Math.abs(bilan))}</b>
          </div>
        </section>
      )}

      <Chips filters={GAME_FILTERS} value={status} onChange={setStatus} />

      {error && <p className="error" role="alert">{error}</p>}
      {!bets && !error && <p className="hint">Chargement…</p>}
      {bets && bets.length === 0 && <p className="note">Aucun pari de jeu pour le moment.</p>}

      {groups.map((group) => (
        <section key={group.label} className="match-day">
          <h2 className="section-label-sport">{group.label}</h2>
          <ul className="op-list">
            {group.bets.map((bet) => {
              const badge = GAME_STATUS[bet.status] || GAME_STATUS.open;
              const net = bet.payout === null ? null : bet.payout - bet.stake;
              return (
                <li key={`${bet.game}-${bet.id}`} className="op-item">
                  <div>
                    <strong>{bet.label}</strong>
                    <small>
                      {new Date(bet.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · Mise {formatFcfa(bet.stake, { unit: false })}
                    </small>
                    <span className={`bet-status ${badge.tone}`}>{badge.label}</span>
                  </div>
                  <b className={net === null ? '' : net >= 0 ? 'positive' : 'negative'}>
                    {net === null ? '—' : `${net >= 0 ? '+' : '−'}${formatFcfa(Math.abs(net), { unit: false })}`}
                  </b>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {bets && bets.length > 0 && (
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
    </div>
  );
}

// Paris sport : liste filtrée par statut. Un clic ouvre le détail du ticket.
function SportBetList() {
  const navigate = useNavigate();
  const [bets, setBets] = useState(null);
  const [status, setStatus] = useState('open');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    functions
      .httpsCallable('getMySportBets')({})
      .then(({ data }) => setBets(data.bets))
      .catch((err) => setError(err?.message || 'Paris indisponibles pour le moment.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = (bets || []).filter((bet) => {
    if (status === 'all') return true;
    if (status === 'won') return bet.status === 'won' || bet.status === 'cashed';
    return bet.status === status;
  });

  // Résumé du jour (UTC), comme pour les jeux : misé, gagné, bilan.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const todayBets = (bets || []).filter((bet) => bet.createdAt >= startOfDay.getTime());
  const todayStake = todayBets.reduce((sum, bet) => sum + bet.stake, 0);
  const todayPayout = todayBets.reduce((sum, bet) => sum + (bet.payout ?? 0), 0);
  const todayBilan = todayPayout - todayStake;

  return (
    <div className="mybets-stack">
      {bets && (
        <section className="wallet-card" aria-label="Résumé du jour">
          <small>Aujourd'hui</small>
          <div className="summary-row"><span>Misé</span><b>{formatFcfa(todayStake)}</b></div>
          <div className="summary-row"><span>Gagné</span><b className="positive">{formatFcfa(todayPayout)}</b></div>
          <div className="summary-row">
            <span>Bilan</span>
            <b className={todayBilan >= 0 ? 'positive' : 'negative'}>{todayBilan >= 0 ? '+' : '−'}{formatFcfa(Math.abs(todayBilan))}</b>
          </div>
        </section>
      )}
      <Chips filters={SPORT_FILTERS} value={status} onChange={setStatus} />

      {error && <p className="error" role="alert">{error}</p>}
      {!bets && !error && <p className="hint">Chargement…</p>}
      {bets && shown.length === 0 && (
        <p className="note">
          Aucun pari dans ce filtre.{' '}
          <button type="button" className="link-button" onClick={() => navigate('/sport')}>Parier</button>
        </p>
      )}

      <ul className="bet-list">
        {shown.map((bet) => {
          const badge = SPORT_STATUS[bet.status] || SPORT_STATUS.open;
          const settled = bet.status !== 'open';
          const net = settled && bet.payout !== null ? bet.payout - bet.stake : null;
          return (
            <li key={bet.id} className="bet-card">
              <button type="button" className="bet-card-button" onClick={() => navigate(`/mes-paris/sport/${bet.id}`)} aria-label="Voir le détail du pari">
                <div className="bet-head">
                  <small>{bet.mode === 'combo' ? 'Combiné' : 'Simple'} · {bet.selections.length} sélection(s)</small>
                  <span className={`bet-status ${badge.tone}`}>{badge.label}</span>
                </div>
                <ul className="bet-selections">
                  {bet.selections.map((selection, index) => (
                    <li key={index}>
                      <span>
                        <strong>{selection.label}</strong>
                        <small>{selection.homeTeam} – {selection.awayTeam}</small>
                      </span>
                      <b>{selection.price.toFixed(2)}</b>
                    </li>
                  ))}
                </ul>
                <div className="summary-row"><span>Mise</span><b>{formatFcfa(bet.stake)}</b></div>
                {settled ? (
                  <div className="summary-row">
                    <span>Résultat</span>
                    <b className={net >= 0 ? 'positive' : 'negative'}>{net === null ? '—' : formatFcfa(net)}</b>
                  </div>
                ) : (
                  <div className="summary-row">
                    <span>Gain potentiel</span>
                    <b className="positive">{formatFcfa(bet.potentialPayout)}</b>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
