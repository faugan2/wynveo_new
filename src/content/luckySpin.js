// Cases de la roue Lucky Spin, dans l'ordre de la roue (sens horaire, à partir du haut).
// L'ordre et les multiplicateurs doivent correspondre à functions/games.js.
export const LUCKY_SPIN_SEGMENTS = [
  { multiplier: 2, label: '2x', color: '#7c3aed' },
  { multiplier: 5, label: '5x', color: '#2563eb' },
  { multiplier: 10, label: '10x', color: '#06b6d4' },
  { multiplier: 50, label: '50x', color: '#dc2626' },
  { multiplier: 1, label: '1x', color: '#7c3aed' },
  { multiplier: 0.5, label: '0,5x', color: '#1d4ed8' },
  { multiplier: 10, label: '10x', color: '#16a34a' },
  { multiplier: 2, label: '2x', color: '#f97316' },
];

export const LUCKY_SPIN_STAKE = { min: 100, max: 10000, default: 1000, step: 100, chips: [1000, 2000, 5000, 10000] };
