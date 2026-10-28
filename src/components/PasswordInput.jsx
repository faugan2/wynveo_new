import { useState } from 'react';

// Champ mot de passe avec bouton « Afficher / Masquer ».
export default function PasswordInput({ value, onChange, placeholder, autoComplete = 'current-password' }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button type="button" className="field-action" onClick={() => setVisible((v) => !v)}>
        {visible ? 'Masquer' : 'Afficher'}
      </button>
    </div>
  );
}
