import { Link } from 'react-router-dom';
import '../styles/game-tile.css';

// Carte de jeu façon vitrine : illustration en portrait, badges, bouton « Jouer » en bas de l'illustration,
// puis le nom et une ligne de méta sous la carte. Sert à la rangée de l'accueil et à la page Jeux.
// - imageUrl : illustration (sinon la carte garde sa couleur, ou un fond sobre avec l'icône).
// - badge : libellé optionnel (« Nouveau », « Populaire ») réglé dans l'admin.
export default function GameCard({ name, meta, to, imageUrl, color, badge, icon: Icon, soon = false }) {
  return (
    <article className={`game-tile${soon ? ' is-soon' : ''}`}>
      <div
        className="game-tile-art"
        style={color && !imageUrl ? { background: `linear-gradient(170deg, ${color} 0%, #141415 100%)` } : undefined}
      >
        {imageUrl ? (
          <img className="game-tile-img" src={imageUrl} alt="" loading="lazy" />
        ) : (
          Icon && (
            <span className="game-tile-icon" aria-hidden="true">
              <Icon size={44} />
            </span>
          )
        )}
        <span className="game-tile-age">18+</span>
        {badge && <span className="game-tile-badge">{badge}</span>}
        <div className="game-tile-shade" aria-hidden="true" />
        {soon ? (
          <span className="game-tile-play is-disabled">Bientôt</span>
        ) : (
          <Link to={to} className="game-tile-play" aria-label={`Jouer à ${name}`}>
            Jouer
          </Link>
        )}
      </div>
      <strong className="game-tile-name">{name}</strong>
      {meta && <span className="game-tile-meta">{meta}</span>}
    </article>
  );
}
