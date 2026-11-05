import { useEffect, useState } from 'react';
import { functions } from './firebase.js';

// Valeurs de départ, affichées tant que le contenu n'est pas chargé ou si la lecture échoue.
export const DEFAULT_HERO = [
  {
    kicker: 'Jeux Wynveo',
    title: 'Tentez votre chance',
    text: 'Lucky Spin, Mystery Box, Crash et plus. Jouez avec votre solde.',
    ctaLabel: 'Créer un compte',
    ctaTarget: 'register',
    userCtaLabel: 'Jouer',
    userCtaTarget: 'games',
    imageUrl: '',
  },
  {
    kicker: 'Paris sportifs',
    title: 'Pariez sur le football',
    text: 'Cotes 1, N, 2 et plus ou moins 2,5 buts. Paris simples ou combinés.',
    ctaLabel: 'Créer un compte',
    ctaTarget: 'register',
    userCtaLabel: 'Voir les matchs',
    userCtaTarget: 'sport',
    imageUrl: '',
  },
  {
    kicker: 'Bonus de bienvenue',
    title: 'Commencez avec un bonus',
    text: 'Versé une seule fois, à votre premier dépôt confirmé.',
    ctaLabel: 'Créer un compte',
    ctaTarget: 'register',
    userCtaLabel: 'Mon espace',
    userCtaTarget: 'home',
    imageUrl: '',
  },
];

// Destination d'un bouton, selon que le visiteur est connecté ou non.
const VISITOR_PATHS = { register: '/register', login: '/login', games: '/univers/jeux', sport: '/univers/sport', home: '/', bonus: '/register' };
const MEMBER_PATHS = { register: '/home', login: '/home', games: '/jeux', sport: '/sport', home: '/home', bonus: '/bonus' };

// Page de chaque jeu de la rangée d'accueil, selon sa clé (même routes que la page Jeux).
export const GAME_PAGES = {
  spin: '/jeux/lucky-spin',
  box: '/jeux/mystery-box',
  number: '/jeux/lucky-number',
  jackpot: '/jeux/jackpot',
  crash: '/jeux/crash',
};

export function targetPath(target, user) {
  const table = user ? MEMBER_PATHS : VISITOR_PATHS;
  return table[target] || '/';
}

// Slides du héros, prêtes à afficher : libellé et destination du bouton selon le visiteur.
export function heroSlidesFor(slides, user) {
  return slides.map((slide) => ({
    kicker: slide.kicker,
    title: slide.title,
    text: slide.text,
    imageUrl: slide.imageUrl || '',
    cta: {
      label: user ? slide.userCtaLabel : slide.ctaLabel,
      to: targetPath(user ? slide.userCtaTarget : slide.ctaTarget, user),
    },
  }));
}

// Cartes à droite du héros : valeurs de départ.
export const DEFAULT_SIDE_CARDS = [
  { title: 'Paris sportifs', subtitle: 'Football : 1, N, 2 et plus ou moins 2,5 buts', color: '#2a2b2e', imageUrl: '', target: 'register' },
  { title: 'Bonus de bienvenue', subtitle: 'Versé à votre premier dépôt confirmé', color: '#2a2b2e', imageUrl: '', target: 'register' },
];

// Jeux de la rangée « Jeux Wynveo » : valeurs de départ.
export const DEFAULT_GAMES = [
  { key: 'spin', name: 'Lucky Spin', desc: 'Tournez la roue', color: '#6b2bd9', imageUrl: '', badge: '', target: 'register' },
  { key: 'box', name: 'Mystery Box', desc: 'Ouvrez la boîte', color: '#e0701a', imageUrl: '', badge: '', target: 'register' },
  { key: 'number', name: 'Lucky Number', desc: 'Trouvez les bons numéros', color: '#1a7fd1', imageUrl: '', badge: '', target: 'register' },
  { key: 'jackpot', name: 'Jackpot', desc: 'Tirage quotidien', color: '#b8860b', imageUrl: '', badge: '', target: 'register' },
  { key: 'crash', name: 'Crash', desc: 'Encaissez avant la chute', color: '#d12b4f', imageUrl: '', badge: '', target: 'register' },
];

// Contenu de l'accueil visiteur, lu depuis l'admin (fonction getHomeContent, sans connexion).
export function useHomeContent() {
  const [content, setContent] = useState({ slides: DEFAULT_HERO, sideCards: DEFAULT_SIDE_CARDS, games: DEFAULT_GAMES });

  useEffect(() => {
    let active = true;
    functions
      .httpsCallable('getHomeContent')({})
      .then(({ data }) => {
        if (!active) return;
        setContent({
          slides: Array.isArray(data.slides) && data.slides.length > 0 ? data.slides : DEFAULT_HERO,
          sideCards: Array.isArray(data.sideCards) && data.sideCards.length === 2 ? data.sideCards : DEFAULT_SIDE_CARDS,
          games: Array.isArray(data.games) && data.games.length > 0 ? data.games : DEFAULT_GAMES,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return content;
}

// Texte blanc ou sombre selon la luminosité de la couleur de fond.
export function textColorFor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#141415' : '#ffffff';
}
