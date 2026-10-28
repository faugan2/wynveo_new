import { useState } from 'react';
import { DEFAULT_COUNTRY, ENABLED_COUNTRIES } from '../config/countries.js';

// Drapeau SVG local (bibliothèque flag-icons), affiché aussi sous Windows.
function Flag({ code }) {
  return <span className={`fi fi-${code.toLowerCase()} country-flag`} aria-hidden="true" />;
}

// Champ numéro avec sélecteur de pays : drapeau, indicatif, puis liste avec drapeaux et noms.
export default function PhoneInput({ country, onCountryChange, value, onChange, autoFocus }) {
  const [open, setOpen] = useState(false);
  const selected = country || DEFAULT_COUNTRY;

  return (
    <div className="phone-field">
      <div className="field">
        <button
          type="button"
          className="country-trigger"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Pays : ${selected.name}, ${selected.dialCode}. Changer de pays`}
        >
          <Flag code={selected.code} />
          <span>{selected.dialCode}</span>
          <span className="country-caret" aria-hidden="true">▾</span>
        </button>
        <span className="field-divider" aria-hidden="true" />
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={'• '.repeat(selected.phoneLength).trim()}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
        />
      </div>

      {open && (
        <>
          {/* Zone invisible qui ferme la liste lorsqu'on touche ailleurs. */}
          <div className="country-backdrop" onClick={() => setOpen(false)} />
          <ul className="country-menu" role="listbox" aria-label="Choisir un pays">
            {ENABLED_COUNTRIES.map((c) => (
              <li key={c.code} role="option" aria-selected={c.code === selected.code}>
                <button
                  type="button"
                  className={`country-option${c.code === selected.code ? ' is-selected' : ''}`}
                  onClick={() => {
                    onCountryChange(c);
                    setOpen(false);
                  }}
                >
                  <Flag code={c.code} />
                  <span className="country-name">{c.name}</span>
                  <span className="country-dial">{c.dialCode}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
