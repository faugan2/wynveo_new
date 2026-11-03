// Bouton de cote : libellé (1, X, 2, Plus de 2,5…) et cote. Actif quand le choix est dans le coupon.
export default function OddsButton({ label, price, active, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`odds-button${active ? ' is-selected' : ''}`}
      onClick={onClick}
      disabled={disabled || price == null}
      aria-pressed={active}
    >
      <small>{label}</small>
      <strong>{price == null ? '—' : price.toFixed(2)}</strong>
    </button>
  );
}
