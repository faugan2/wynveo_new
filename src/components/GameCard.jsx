import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IoBookmark,
  IoBookmarkOutline,
  IoEllipsisVertical,
  IoInformationCircleOutline,
  IoShareSocialOutline,
} from 'react-icons/io5';
import '../styles/game-tile.css';
import { formatPlays } from '../lib/gameStats.js';
const MENU_HEIGHT = 240; // hauteur estimée du menu, pour le placer au-dessus si l'écran manque de place
const MENU_WIDTH = 260;

// Carte de jeu façon vitrine : illustration en portrait, badges, bouton « Jouer » en bas de l'illustration,
// puis le nom, le nombre de parties et un menu ⋮ à droite du nom.
// - imageUrl : illustration (sinon la carte garde sa couleur, ou un fond sobre avec l'icône).
// - badge : libellé optionnel (« Nouveau », « Populaire ») réglé dans l'admin.
// - plays : nombre de parties réel (0 compris) ; rien n'est affiché tant qu'il n'est pas connu.
// - infoTo : page d'information du jeu.
// - onToggleFavorite(favorite) : favoris du membre. Absent pour un visiteur (l'entrée n'apparaît pas).
export default function GameCard({ name, meta, to, infoTo, imageUrl, color, badge, plays, icon: Icon, soon = false, favorite = false, onToggleFavorite }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  function openMenu() {
    const rect = buttonRef.current.getBoundingClientRect();
    const below = rect.bottom + 6;
    const top = below + MENU_HEIGHT > window.innerHeight ? Math.max(8, rect.top - MENU_HEIGHT - 6) : below;
    // Menu de 260 px aligné sur le bouton, mais toujours dans l'écran.
    const left = Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    setPos({ top, left });
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setCopied(false);
  }

  // Fermeture : clic ailleurs, Échap, ou défilement (le menu est fixé à l'écran).
  useEffect(() => {
    if (!open) return undefined;
    function onDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) closeMenu();
    }
    function onKey(event) {
      if (event.key === 'Escape') closeMenu();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [open]);

  function toggleFavorite() {
    closeMenu();
    onToggleFavorite(!favorite);
  }

  async function share() {
    const url = `${window.location.origin}${to}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
        closeMenu();
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(closeMenu, 1200);
    } catch {
      closeMenu(); // partage annulé ou presse-papiers refusé
    }
  }

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

      <div className="game-tile-head">
        <div className="game-tile-info">
          <strong className="game-tile-name">{name}</strong>
          {typeof plays === 'number' && <span className="game-tile-plays">{formatPlays(plays)}</span>}
          {meta && <span className="game-tile-meta">{meta}</span>}
        </div>

        <div className="game-tile-more-wrap" ref={wrapRef}>
          <button
            ref={buttonRef}
            type="button"
            className="game-tile-more"
            aria-label={`Plus d'options pour ${name}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => (open ? closeMenu() : openMenu())}
          >
            <IoEllipsisVertical size={18} aria-hidden="true" />
          </button>

          {open && pos && (
            <ul className="game-tile-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
              {onToggleFavorite && (
                <li role="none">
                  <button type="button" role="menuitem" className="game-tile-menu-item" onClick={toggleFavorite}>
                    {favorite ? <IoBookmark size={20} aria-hidden="true" /> : <IoBookmarkOutline size={20} aria-hidden="true" />}
                    <span>{favorite ? 'Retirer des favoris' : 'Enregistrer dans favoris'}</span>
                  </button>
                </li>
              )}
              <li role="none">
                <button type="button" role="menuitem" className="game-tile-menu-item" onClick={share}>
                  <IoShareSocialOutline size={20} aria-hidden="true" />
                  <span>{copied ? 'Lien copié' : 'Partager'}</span>
                </button>
              </li>
              {infoTo && (
                <li role="none">
                  <Link to={infoTo} role="menuitem" className="game-tile-menu-item" onClick={closeMenu}>
                    <IoInformationCircleOutline size={20} aria-hidden="true" />
                    <span>Voir les infos sur le jeu</span>
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
