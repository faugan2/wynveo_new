import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import CouponBar from '../components/CouponBar.jsx';
import OddsButton from '../components/OddsButton.jsx';
import { useCoupon } from '../context/CouponContext.jsx';
import { isBettable, selectionFor, timeLabel, useUpcomingEvents } from '../lib/sportEvents.js';

// Jours proposés : aujourd'hui et demain. Les matchs plus loin apparaîtront quand l'import les couvrira.
const DAYS = [
  { key: 'today', label: "Aujourd'hui", offset: 0 },
  { key: 'tomorrow', label: 'Demain', offset: 1 },
];

// Drapeau de la compétition, comme sur la maquette. Une compétition sans drapeau affiche seulement son nom.
const LEAGUE_FLAGS = { 'Ligue 1': '🇫🇷' };
function leagueLabel(league) {
  const flag = LEAGUE_FLAGS[league];
  return flag ? `${flag} ${league}` : league;
}

// Vrai si le match a lieu le jour décalé de « offset » jours par rapport à aujourd'hui.
function onDay(commenceMs, offset) {
  const day = new Date(Date.now() + offset * 24 * 3600 * 1000);
  return new Date(commenceMs).toDateString() === day.toDateString();
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
        label: new Date(match.commenceMs).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
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
  const { events, error } = useUpcomingEvents();
  const { selections, toggle } = useCoupon();
  const [dayKey, setDayKey] = useState('today');
  const isPicked = (eventId, pick) => selections.some((item) => item.eventId === eventId && item.pick === pick);

  const live = (events || []).filter((event) => event.status === 'live');
  const day = DAYS.find((item) => item.key === dayKey);
  const allUpcoming = (events || []).filter((event) => event.status === 'upcoming');
  const upcoming = allUpcoming.filter((event) => onDay(event.commenceMs, day.offset));
  // Si le jour choisi n'a aucun match, on montre les prochains matchs, groupés par date.
  // Aujourd'hui et demain n'ont aucun match : on masque l'en-tête des jours et on affiche les matchs à venir par date.
  const hasDayMatches = (events || []).some((event) => event.status === 'upcoming' && (onDay(event.commenceMs, 0) || onDay(event.commenceMs, 1)));
  const showAll = hasDayMatches && Boolean(events) && upcoming.length === 0 && allUpcoming.length > 0;
  const groups = groupByDate(!hasDayMatches || showAll ? allUpcoming : upcoming);
  const dayName = day.key === 'today' ? "aujourd'hui" : 'demain';

  return (
    <ConnectedLayout>
      <div className="sport-filters" role="group" aria-label="Sport">
        <button type="button" className="sport-chip is-active" aria-pressed="true">⚽ Football</button>
        {/* Sports à venir : affichés désactivés tant que leurs matchs ne sont pas importés. */}
        {['🏀 Basket', '🎾 Tennis', '🥊 MMA'].map((label) => (
          <button key={label} type="button" className="sport-chip" disabled aria-disabled="true" title="Bientôt disponible">
            {label}
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

      {hasDayMatches && (
        <div className="day-header">
          <h2 className="day-title">{day.label}</h2>
          <button
            type="button"
            className="day-switch"
            onClick={() => setDayKey(dayKey === 'today' ? 'tomorrow' : 'today')}
          >
            {dayKey === 'today' ? 'Demain ›' : "‹ Aujourd'hui"}
          </button>
        </div>
      )}

      {hasDayMatches && showAll && <p className="note">Aucun match {dayName}. Prochains matchs :</p>}
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

      <CouponBar />
    </ConnectedLayout>
  );
}
