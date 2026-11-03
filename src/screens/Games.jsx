import { useNavigate, useParams } from 'react-router-dom';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { GAMES, GAMES_BY_SLUG } from '../content/games.js';
import { formatFcfa } from '../lib/format.js';
import { useJackpotSummary } from '../lib/jackpotSummary.js';

// Page Jeux : liste des jeux, avec la mise et l'accès à chaque jeu.
export default function Games() {
  const navigate = useNavigate();
  const jackpot = useJackpotSummary();

  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">Jeux</h1>
      <p className="note">Choisissez un jeu et misez avec le solde de vos dépôts.</p>

      <ul className="game-list">
        {GAMES.map((game) => (
          <li key={game.slug}>
            <article className={`game-card${game.soon ? ' is-soon' : ''}`}>
              <div className="game-head">
              <span className="game-icon" aria-hidden="true">{game.icon}</span>
              <div className="game-body">
                <strong className="title-font">{game.name}</strong>
                <span>{game.text}</span>
                {game.slug === 'jackpot' && (
                  <small className="gold">Cagnotte : {jackpot ? formatFcfa(jackpot.pot) : '—'}</small>
                )}
                {game.stake && <small>{game.stake}</small>}
              </div>
              </div>
              {game.soon ? (
                <span className="game-badge">Bientôt</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  onClick={() => navigate(`/jeux/${game.slug}`)}
                >
                  Jouer
                </button>
              )}
            </article>
          </li>
        ))}
      </ul>
    </ConnectedLayout>
  );
}

// Page provisoire d'un jeu : le jeu lui-même sera conçu avec sa maquette.
export function GamePlaceholder() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const game = GAMES_BY_SLUG[slug];

  return (
    <ConnectedLayout>
      <button type="button" className="back-button" onClick={() => navigate('/jeux')} aria-label="Retour aux jeux">
        ‹
      </button>
      <h1 className="title-font page-title">{game ? game.name : 'Jeu introuvable'}</h1>
      <p className="note">Le jeu est en cours de construction. Maquette et règles à venir.</p>
    </ConnectedLayout>
  );
}
