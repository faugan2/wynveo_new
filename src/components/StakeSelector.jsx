import { formatFcfa } from '../lib/format.js';

// Choix de la mise : boutons − et +, et raccourcis. Utilisé par les jeux.
export default function StakeSelector({ stake, onChange, available, min, max, step, chips, disabled }) {
  const clamp = (value) => Math.min(max, Math.max(min, value));

  return (
    <section className="stake-box">
      <div className="stake-head">
        <span>Montant de la mise</span>
        <small>Solde : {formatFcfa(available)}</small>
      </div>

      <div className="stepper">
        <button type="button" disabled={disabled} onClick={() => onChange(clamp(stake - step))} aria-label="Diminuer la mise">−</button>
        <strong>{formatFcfa(stake)}</strong>
        <button type="button" disabled={disabled} onClick={() => onChange(clamp(stake + step))} aria-label="Augmenter la mise">+</button>
      </div>

      <div className="chips">
        {chips.map((value) => (
          <button
            type="button"
            key={value}
            disabled={disabled}
            className={`chip${stake === value ? ' is-selected' : ''}`}
            onClick={() => onChange(value)}
          >
            {formatFcfa(value, { unit: false })}
          </button>
        ))}
      </div>

      {stake > available && <p className="hint">Solde insuffisant pour cette mise.</p>}
    </section>
  );
}
