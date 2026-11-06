import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import CouponBar from '../components/CouponBar.jsx';
import OddsButton from '../components/OddsButton.jsx';
import { useCoupon } from '../context/CouponContext.jsx';
import { isBettable, selectionFor, timeLabel, usePagedUpcomingEvents, useVisibleLeagues, visibleEvents } from '../lib/sportEvents.js';

// Drapeau de la compétition, comme sur la maquette. Une compétition sans drapeau affiche seulement son nom.
const LEAGUE_FLAGS = { 'Ligue 1': '🇫🇷' };
function leagueLabel(league) {
  const flag = LEAGUE_FLAGS[league];
  return flag ? `${flag} ${league}` : league;
}

// Titre d'un groupe de matchs : « Aujourd'hui », « Demain », ou la date complète pour les autres jours.
function dayTitle(commenceMs) {
  const date = new Date(commenceMs);
  if (date.toDateString() === new Date().toDateString()) return "Aujourd'hui";
  if (date.toDateString() === new Date(Date.now() + 24 * 3600 * 1000).toDateString()) return 'Demain';
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Regroupe les matchs par jour, dans l'ordre des dates : [{ key, label, matches }].
function groupByDate(matches) {
  const groups = [];
  for (const match of matches) {
    const key = new Date(match.commenceMs).toDateString();
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = {
        key,
        label: dayTitle(match.commenceMs),
        matches: [],
      };
      groups.push(group);
    }
    group.matches.push(match);
  }
  return groups;
}

// Écran Sport : matchs en direct, puis matchs à venir d'aujourd'hui ou de demain, avec les cotes 1 N 2 (maquette 15).
export default function SportHome() {
  const navigate = useNavigate();
  // Matchs à venir par pages de 10 : « Suivant » / « Précédent ».
  const paging = usePagedUpcomingEvents(10);
  const { events: allEvents, error } = paging;
  const leagueKeys = useVisibleLeagues();
  const [leagueFilter, setLeagueFilter] = useState('all');
  const leagueList = leagueKeys ? [...leagueKeys.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr')) : [];
  const visible = visibleEvents(allEvents, leagueKeys);
  const events = leagueFilter === 'all' || !visible ? visible : visible.filter((event) => event.sportKey === leagueFilter);
  const { selections, toggle } = useCoupon();
  const isPicked = (eventId, pick) => selections.some((item) => item.eventId === eventId && item.pick === pick);

  const live = (events || []).filter((event) => event.status === 'live');
  // Tous les matchs à venir, groupés par date (Aujourd'hui, Demain, puis la date).
  const allUpcoming = (events || []).filter((event) => event.status === 'upcoming');
  const groups = groupByDate(allUpcoming);

  return (
    <ConnectedLayout>
      {/* Filtre par compétition : seules les compétitions activées et visibles par l'admin sont proposées. */}
      <div className="sport-filters" role="group" aria-label="Compétitions">
        <button type="button" className={`sport-chip${leagueFilter === 'all' ? ' is-active' : ''}`} aria-pressed={leagueFilter === 'all'} onClick={() => setLeagueFilter('all')}>
          Tous
        </button>
        {leagueList.map(([key, title]) => (
          <button
            key={key}
            type="button"
            className={`sport-chip${leagueFilter === key ? ' is-active' : ''}`}
            aria-pressed={leagueFilter === key}
            onClick={() => setLeagueFilter(key)}
          >
            {leagueLabel(title)}
          </button>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!events && !error && <p className="hint">Chargement des matchs…</p>}

      {live.length > 0 && (
        <section className="live-section" aria-label="En direct">
          <div className="live-head">
            <h2 className="section-label-sport live-title">
              <span className="live-dot" aria-hidden="true" /> En direct
            </h2>
            <span className="live-all">Tout le live ({live.length})</span>
          </div>
          <ul className="live-strip">
            {live.map((event) => (
              <li key={event.id}>
                <button type="button" className="live-card" onClick={() => navigate(`/sport/match/${event.id}`)}>
                  <small className="live-meta">{event.league}</small>
                  <span className="live-team">
                    <span className="live-badge-dot" aria-hidden="true" />
                    <strong>{event.homeTeam}</strong>
                    <b className="live-score">—</b>
                  </span>
                  <span className="live-team">
                    <span className="live-badge-dot" aria-hidden="true" />
                    <strong>{event.awayTeam}</strong>
                    <b className="live-score">—</b>
                  </span>
                  <span className="live-odds">
                    {['1', 'X', '2'].map((label) => (
                      <span key={label} className="live-odd">
                        <small>{label}</small>
                        <strong>—</strong>
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {events && allUpcoming.length === 0 && <p className="note">Aucun match à venir pour le moment.</p>}

      {groups.map((group) => (
        <section key={group.key} className="match-day">
          <h2 className="section-label-sport">{group.label}</h2>
          <ul className="match-list">
            {group.matches.map((event) => {
              const open = isBettable(event);
              return (
                <li key={event.id} className="match-card">
                  <div className="match-card-head">
                    <small>{leagueLabel(event.league)}</small>
                    <small>{timeLabel(event.commenceMs)}</small>
                  </div>
                  <button type="button" className="match-teams" onClick={() => navigate(`/sport/match/${event.id}`)}>
                    <strong>{event.homeTeam}</strong>
                    <strong>{event.awayTeam}</strong>
                  </button>
                  <div className="odds-row">
                    {['home', 'draw', 'away'].map((pick) => (
                      <OddsButton
                        key={pick}
                        label={pick === 'home' ? '1' : pick === 'draw' ? 'X' : '2'}
                        price={event.odds ? event.odds[pick] : null}
                        active={isPicked(event.id, pick)}
                        disabled={!open}
                        onClick={() => toggle(selectionFor(event, pick))}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Pagination : « Suivant » seulement s'il reste des matchs à afficher ; « Précédent » reste toujours accessible. */}
      {events && (paging.hasPrev || (paging.hasNext && allUpcoming.length > 0)) && (
        <nav className="sport-pager" aria-label="Pages de matchs">
          <button type="button" className="sport-pager-btn" onClick={paging.goPrev} disabled={!paging.hasPrev}>
            ‹ Précédent
          </button>
          <span className="sport-pager-page">Page {paging.page + 1}</span>
          <button type="button" className="sport-pager-btn" onClick={paging.goNext} disabled={!paging.hasNext}>
            Suivant ›
          </button>
        </nav>
      )}

      <CouponBar />
    </ConnectedLayout>
  );
}
