import { useState } from 'react';
import { DEFAULT_COUNTRY, ENABLED_COUNTRIES } from '../config/countries.js';

// Champ numéro avec sélecteur de pays. Renvoie la saisie brute au parent.
export default function PhoneInput({ country, onCountryChange, value, onChange, autoFocus }) {
  const [open, setOpen] = useState(false);
  const selected = country || DEFAULT_COUNTRY;

  return (
    <div className="field" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="field-action"
        style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}
        aria-label="Choisir le pays"
      >
        {selected.flag} {selected.dialCode} ▾
      </button>
      {open && ENABLED_COUNTRIES.length > 1 && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 10,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            listStyle: 'none',
            margin: 4,
            padding: 4,
          }}
        >
          {ENABLED_COUNTRIES.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                className="field-action"
                style={{ color: 'var(--text)', padding: '8px 12px' }}
                onClick={() => {
                  onCountryChange(c);
                  setOpen(false);
                }}
              >
                {c.flag} {c.name} {c.dialCode}
              </button>
            </li>
          ))}
        </ul>
      )}
      <span style={{ color: 'var(--border)' }}>|</span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder={'0'.repeat(selected.phoneLength).replace(/0/g, '• ').trim()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
    </div>
  );
}
