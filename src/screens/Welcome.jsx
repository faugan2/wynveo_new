import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { heroSlidesFor, targetPath, textColorFor, useHomeContent } from '../lib/homeContent.js';
import GuestLayout from '../components/GuestLayout.jsx';
import GameCard from '../components/GameCard.jsx';
import { kickoffLabel, usePublicMatches } from '../lib/sportEvents.js';
import '../styles/guest-home.css';
import '../styles/home-matches.css';

// Accueil des visiteurs (non connectés) : bandeau principal, jeux, sport, bonus, et accès à la connexion.
// Mise en page inspirée des grands sites de paris, avec les couleurs et les jeux de Wynveo.
// Trois slides à la une : jeux, sport, bonus. Défilement automatique (en pause au survol et si l'utilisateur
// préfère moins d'animations), flèches, points, et glissement au doigt sur téléphone.
const SLIDE_DELAY_MS = 6000;

function HeroCarousel({ user, rawSlides }) {
  const slides = heroSlidesFor(rawSlides, user);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef(null);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const go = (next) => setIndex((next + slides.length) % slides.length);

  useEffect(() => {
    if (paused || reduceMotion) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % slides.length), SLIDE_DELAY_MS);
    return () => clearInterval(timer);
  }, [paused, reduceMotion, slides.length]);

  return (
    <section
      className="guest-carousel"
      aria-roledescription="carrousel"
      aria-label="À la une"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const dx = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (dx < -40) go(index + 1);
        if (dx > 40) go(index - 1);
      }}
    >
      <div className="guest-carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((slide, position) => (
          <article
            key={position}
            className={`guest-slide guest-slide--${['games', 'sport', 'bonus'][position] || 'games'}`}
            aria-hidden={position !== index}
            style={slide.imageUrl ? { backgroundImage: `linear-gradient(90deg, rgba(20,20,21,0.92) 25%, rgba(20,20,21,0.35)), url("${slide.imageUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            <p className="guest-kicker">{slide.kicker}</p>
            <h1 className="guest-hero-title">{slide.title}</h1>
            <p className="guest-hero-text">{slide.text}</p>
            <div className="guest-hero-cta">
              <Link to={slide.cta.to} className="guest-btn guest-btn--primary guest-btn--large" tabIndex={position === index ? 0 : -1}>
                {slide.cta.label}
              </Link>
            </div>
          </article>
        ))}
      </div>

      <button type="button" className="guest-carousel-arrow is-prev" aria-label="Slide précédent" onClick={() => go(index - 1)}>
        ‹
      </button>
      <button type="button" className="guest-carousel-arrow is-next" aria-label="Slide suivant" onClick={() => go(index + 1)}>
        ›
      </button>

      <div className="guest-carousel-dots" role="tablist" aria-label="Choisir une slide">
        {slides.map((slide, position) => (
          <button
            key={slide.key}
            type="button"
            role="tab"
            aria-selected={position === index}
            aria-label={`Slide ${position + 1}`}
            className={`guest-carousel-dot${position === index ? ' is-active' : ''}`}
            onClick={() => setIndex(position)}
          />
        ))}
      </div>
    </section>
  );
}

export default function Welcome() {
  const { user } = useAuth();
  const { slides: heroRaw, sideCards, games } = useHomeContent();
  const gamesRef = useRef(null);
  const matches = usePublicMatches();
  const matchesRef = useRef(null);

  // Fait défiler la rangée de jeux d'une page (flèches, ordinateur).
  function scrollGames(direction) {
    const row = gamesRef.current;
    if (row) row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: 'smooth' });
  }

  // Même défilement pour la rangée des matchs (comme les jeux).
  function scrollMatches(direction) {
    const row = matchesRef.current;
    if (row) row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: 'smooth' });
  }

  return (
    <GuestLayout active="home">
      <section className="guest-top">
        <HeroCarousel user={user} rawSlides={heroRaw} />

        <aside className="guest-side">
          {sideCards.map((card, position) => (
            <Link
              key={position}
              to={targetPath(card.target, user)}
              className="guest-promo"
              style={{ background: card.color, color: textColorFor(card.color) }}
            >
              <span className="guest-promo-title">{card.title}</span>
              {card.subtitle && <span className="guest-promo-text">{card.subtitle}</span>}
              {card.imageUrl && <img className="guest-promo-image" src={card.imageUrl} alt="" />}
            </Link>
          ))}
        </aside>
      </section>

      <section className="guest-section" aria-labelledby="guest-games-title">
        <div className="guest-section-head">
          <h2 id="guest-games-title" className="guest-section-title">Jeux Wynveo</h2>
          <div className="guest-row-arrows">
            <button type="button" aria-label="Jeux précédents" onClick={() => scrollGames(-1)}>‹</button>
            <button type="button" aria-label="Jeux suivants" onClick={() => scrollGames(1)}>›</button>
          </div>
        </div>
        <ul className="guest-games" ref={gamesRef}>
          {games.map((game) => (
            <li key={game.key} className="guest-games-item">
              <GameCard
                name={game.name}
                meta={game.desc}
                to={targetPath(game.target, user)}
                imageUrl={game.imageUrl}
                color={game.color}
                badge={game.badge}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="guest-section" aria-labelledby="guest-matches-title">
        <div className="guest-section-head">
          <h2 id="guest-matches-title" className="guest-section-title">Matchs à venir</h2>
          <div className="guest-row-arrows">
            <button type="button" aria-label="Matchs précédents" onClick={() => scrollMatches(-1)}>‹</button>
            <button type="button" aria-label="Matchs suivants" onClick={() => scrollMatches(1)}>›</button>
          </div>
        </div>
        {matches === null && <p className="guest-matches-note">Chargement des matchs…</p>}
        {matches && matches.length === 0 && <p className="guest-matches-note">Aucun match à venir pour le moment.</p>}
        {matches && matches.length > 0 && (
          <ul className="guest-match-list" ref={matchesRef}>
            {matches.map((match) => (
              <li key={match.id}>
                <Link to={`/sport/match/${match.id}`} className="guest-match-card">
                  <span className="guest-match-meta">
                    <small>{match.league}</small>
                    <small>{kickoffLabel(match.commenceMs)}</small>
                  </span>
                  <span className="guest-match-teams">
                    <strong>{match.homeTeam}</strong>
                    <strong>{match.awayTeam}</strong>
                  </span>
                  <span className="guest-match-odds" aria-hidden="true">
                    <span>1 <b>{match.odds?.home ?? '–'}</b></span>
                    <span>N <b>{match.odds?.draw ?? '–'}</b></span>
                    <span>2 <b>{match.odds?.away ?? '–'}</b></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </GuestLayout>
  );
}
