import { useEffect, useState } from 'react';
import AdminShell from './AdminShell.jsx';
import { db, functions } from '../../lib/firebase.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Logo de l'application : affiché dans l'en-tête à la place du mot WYNVEO. Sans logo, le texte reste.
export default function AdminBranding() {
  const [logoUrl, setLogoUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    db.collection('wy_settings')
      .doc('branding')
      .get()
      .then((snapshot) => setLogoUrl((snapshot.exists && snapshot.get('logoUrl')) || ''))
      .catch((err) => setError(err?.message || 'Lecture impossible.'));
  }, []);

  // Enregistre le logo (ou l'efface quand url est vide) : l'envoi de fichier et la sauvegarde sont séparés.
  async function saveLogo(url) {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await functions.httpsCallable('adminSaveSettings')({ name: 'branding', values: { logoUrl: url } });
      setLogoUrl(url);
      setMessage(url ? 'Logo enregistré. Il apparaît dans l’en-tête immédiatement.' : 'Logo retiré. Le texte WYNVEO est affiché.');
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Format non accepté (JPEG, PNG ou WebP).');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image trop lourde (2 Mo maximum).');
      return;
    }
    setBusy(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
        reader.readAsDataURL(file);
      });
      const { data } = await functions.httpsCallable('adminUploadHomeImage')({ contentType: file.type, data: base64 });
      setBusy(false);
      await saveLogo(data.url);
    } catch (err) {
      setError(err?.message || 'Envoi impossible.');
      setBusy(false);
    }
  }

  return (
    <AdminShell active="logo">
      <section className="admin-card">
        <h2>Logo de l’application</h2>
        <p className="admin-help">
          Image affichée dans l’en-tête du site, à la place du mot WYNVEO. Format carré ou horizontal, fond transparent conseillé (PNG ou WebP), 2 Mo au maximum.
        </p>

        {logoUrl === null && !error && <p className="admin-hint">Chargement…</p>}

        {logoUrl !== null && (
          <div className="admin-logo-preview">
            {logoUrl ? <img src={logoUrl} alt="Logo actuel" /> : <span className="admin-hint">Aucun logo : le texte WYNVEO est affiché.</span>}
          </div>
        )}

        <div className="admin-actions">
          <label className="admin-primary admin-file-button">
            {busy ? 'Patientez…' : logoUrl ? 'Remplacer le logo' : 'Choisir un logo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} disabled={busy} hidden />
          </label>
          {logoUrl && (
            <button type="button" className="admin-secondary" onClick={() => saveLogo('')} disabled={busy}>
              Retirer le logo
            </button>
          )}
        </div>

        {message && <p className="admin-ok" role="status">{message}</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </section>
    </AdminShell>
  );
}
