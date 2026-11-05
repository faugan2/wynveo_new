import { useNavigate, useParams } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import CouponBar from '../components/CouponBar.jsx';
import GuestLayout from '../components/GuestLayout.jsx';
import OddsButton from '../components/OddsButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCoupon } from '../context/CouponContext.jsx';
import { isBettable, kickoffLabel, selectionFor, useEvent, usePublicEvent } from '../lib/sportEvents.js';

// Détail d'un match : marchés disponibles (1 N 2 et plus/moins 2,5), comme la maquette 16.
// Accessible sans connexion : le visiteur voit le match, et un clic sur une cote l'envoie à la connexion.
export default function SportMatch() {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const { user } = useAuth();
  const memberEvent = useEvent(user ? eventId : undefined);
  const publicEvent = usePublicEvent(user ? undefined : eventId);
  const event = user ? memberEvent : publicEvent;
  const { selections, toggle } = useCoupon();

  const Layout = user ? ConnectedLayout : GuestLayout;
  const layoutProps = user ? {} : { active: 'sport' };
  const backTo = user ? '/sport' : '/';

  if (event === undefined) return <Layout {...layoutProps}><p className="hint">Chargement…</p></Layout>;
  if (event === null) {
    return (
      <Layout {...layoutProps}>
        <button type="button" className="back-button" onClick={() => navigate(backTo)} aria-label="Retour">‹</button>
        <p className="note">Ce match n'existe plus.</p>
      </Layout>
    );
  }

  const open = isBettable(event);
  const isPicked = (pick) => selections.some((item) => item.eventId === event.id && item.pick === pick);
  // Visiteur : une cote ouverte renvoie vers la connexion. Connecté : la cote entre dans le coupon.
  const choose = (pick) => (user ? toggle(selectionFor(event, pick)) : navigate('/login'));

  return (
    <Layout {...layoutProps}>
      <button type="button" className="back-button" onClick={() => navigate(backTo)} aria-label="Retour">‹</button>

      <section className="match-hero">
        <small>{event.league} · {kickoffLabel(event.commenceMs)}</small>
        <div className="match-hero-teams">
          <strong>{event.homeTeam}</strong>
          <span>contre</span>
          <strong>{event.awayTeam}</strong>
        </div>
        {!open && <p className="note">Paris fermés : le match a commencé.</p>}
      </section>

      <section className="market-card">
        <h2 className="market-title">Résultat du match <span>1X2</span></h2>
        <div className="odds-row">
          <OddsButton label={event.homeTeam} price={event.odds?.home} active={isPicked('home')} disabled={!open} onClick={() => choose('home')} />
          <OddsButton label="Nul" price={event.odds?.draw} active={isPicked('draw')} disabled={!open} onClick={() => choose('draw')} />
          <OddsButton label={event.awayTeam} price={event.odds?.away} active={isPicked('away')} disabled={!open} onClick={() => choose('away')} />
        </div>
      </section>

      {event.odds?.line && (
        <section className="market-card">
          <h2 className="market-title">Total de buts <span>{event.odds.line}</span></h2>
          <div className="odds-row">
            <OddsButton label={`Plus de ${event.odds.line}`} price={event.odds.over} active={isPicked('over')} disabled={!open} onClick={() => choose('over')} />
            <OddsButton label={`Moins de ${event.odds.line}`} price={event.odds.under} active={isPicked('under')} disabled={!open} onClick={() => choose('under')} />
          </div>
        </section>
      )}

      {user && <CouponBar />}
    </Layout>
  );
}
