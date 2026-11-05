import { useEffect, useState } from 'react';
import AdminShell from './AdminShell.jsx';
import { functions } from '../../lib/firebase.js';
import { DEFAULT_GAMES, DEFAULT_HERO, DEFAULT_SIDE_CARDS } from '../../lib/homeContent.js';

const TARGET_LABELS = {
  register: 'Inscription',
  login: 'Connexion',
  games: 'Jeux',
  sport: 'Sport',
  home: 'Accueil',
  bonus: 'Bonus',
};

const MAX_SLIDES = 5;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Champ d'image : envoi d'un fichier (Firebase Storage), progression, aperçu et retrait.
function ImageField({ imageUrl, progress, disabled, onPick, onRemove }) {
  return (
    <div className="admin-slide-image">
      <label className="admin-file">
        <span>Image (JPEG, PNG ou WebP, 2 Mo maximum)</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={(event) => onPick(event.target.files?.[0])}
        />
      </label>
      {progress && (
        <div className="admin-upload" role="status" aria-live="polite">
          <div className="admin-upload-label">
            <span>{progress.label}</span>
            {progress.percent !== null && <span>{Math.round(progress.percent)} %</span>}
          </div>
          <div className="admin-upload-bar">
            {progress.percent === null ? <span className="is-indeterminate" /> : <span style={{ width: `${progress.percent}%` }} />}
          </div>
        </div>
      )}
      {imageUrl && (
        <div className="admin-slide-preview">
          <img src={imageUrl} alt="Aperçu de l’image" />
          <button type="button" onClick={onRemove}>Retirer l’image</button>
        </div>
      )}
    </div>
  );
}

// Accueil visiteur : slides du héros et cartes à droite. Lecture et écriture via adminGetSettings / adminSaveSettings.
export default function AdminHome() {
  const [slides, setSlides] = useState(null);
  const [sideCards, setSideCards] = useState(null);
  const [games, setGames] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Envoi d'image en cours : { scope: 'slide' | 'card' | 'game', index, label, percent }
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    functions
      .httpsCallable('adminGetSettings')({ name: 'home' })
      .then(({ data }) => {
        setSlides(Array.isArray(data.values?.slides) && data.values.slides.length ? data.values.slides : DEFAULT_HERO);
        setSideCards(Array.isArray(data.values?.sideCards) && data.values.sideCards.length === 2 ? data.values.sideCards : DEFAULT_SIDE_CARDS);
        setGames(Array.isArray(data.values?.games) && data.values.games.length > 0 ? data.values.games : DEFAULT_GAMES);
      })
      .catch((err) => setError(err?.message || 'Lecture impossible.'));
  }, []);

  // Envoie l'image choisie (Firebase Storage) et enregistre son lien dans la slide ou la carte concernée.
  async function uploadImage(scope, index, file) {
    if (!file) return;
    setError('');
    setMessage('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Format non accepté (JPEG, PNG ou WebP).');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image trop lourde (2 Mo maximum).');
      return;
    }
    setUploading({ scope, index, label: 'Lecture du fichier', percent: 0 });
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploading({ scope, index, label: 'Lecture du fichier', percent: (event.loaded / event.total) * 100 });
          }
        };
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
        reader.readAsDataURL(file);
      });
      setUploading({ scope, index, label: 'Envoi vers le serveur, patientez…', percent: null });
      const { data } = await functions.httpsCallable('adminUploadHomeImage')({ contentType: file.type, data: base64 });
      if (scope === 'slide') updateSlide(index, 'imageUrl', data.url);
      else if (scope === 'game') updateGame(index, 'imageUrl', data.url);
      else updateCard(index, 'imageUrl', data.url);
    } catch (err) {
      setError(err?.message || 'Envoi impossible.');
    } finally {
      setUploading(null);
    }
  }

  function updateSlide(index, field, value) {
    setSlides((current) => current.map((slide, i) => (i === index ? { ...slide, [field]: value } : slide)));
  }

  function updateCard(index, field, value) {
    setSideCards((current) => current.map((card, i) => (i === index ? { ...card, [field]: value } : card)));
  }

  function updateGame(index, field, value) {
    setGames((current) => current.map((game, i) => (i === index ? { ...game, [field]: value } : game)));
  }

  function moveSlide(index, delta) {
    setSlides((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeSlide(index) {
    setSlides((current) => current.filter((_, i) => i !== index));
  }

  function addSlide() {
    setSlides((current) => [...current, { ...DEFAULT_HERO[0], imageUrl: '' }]);
  }

  async function save(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);
    try {
      await functions.httpsCallable('adminSaveSettings')({
        name: 'home',
        values: {
          slides: slides.map((slide) => ({ ...slide, imageUrl: (slide.imageUrl || '').trim() })),
          sideCards: sideCards.map((card) => ({ ...card, imageUrl: (card.imageUrl || '').trim() })),
          games: games.map((game) => ({ ...game, imageUrl: (game.imageUrl || '').trim() })),
        },
      });
      setMessage('Accueil enregistré. Il apparaît aux visiteurs immédiatement.');
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  const progressFor = (scope, index) => (uploading && uploading.scope === scope && uploading.index === index ? uploading : null);

  return (
    <AdminShell active="accueil">
      {!slides && !error && <p className="admin-hint">Chargement…</p>}

      {slides && sideCards && games && (
        <form className="admin-form" onSubmit={save}>
          <section className="admin-card">
            <h2>Héros de l’accueil</h2>
            <p className="admin-help">
              Les slides tournent automatiquement sur la page d’accueil des visiteurs (1 à {MAX_SLIDES}).
              Sans image, la slide garde son fond de couleur.
            </p>
            <div className="admin-slides-grid">
              {slides.map((slide, index) => (
                <article key={index} className="admin-slide-card">
                  <header className="admin-slide-head">
                    <span className="admin-slide-num">{index + 1}</span>
                    <strong>{slide.title || 'Sans titre'}</strong>
                  </header>

                  <div className="admin-row">
                    <label>
                      Accroche (petit texte)
                      <input type="text" maxLength={40} value={slide.kicker} onChange={(e) => updateSlide(index, 'kicker', e.target.value)} />
                    </label>
                    <label>
                      Titre
                      <input type="text" maxLength={80} value={slide.title} onChange={(e) => updateSlide(index, 'title', e.target.value)} />
                    </label>
                  </div>
                  <label>
                    Texte
                    <textarea rows={2} maxLength={200} value={slide.text} onChange={(e) => updateSlide(index, 'text', e.target.value)} />
                  </label>

                  <ImageField
                    imageUrl={slide.imageUrl}
                    progress={progressFor('slide', index)}
                    disabled={uploading !== null}
                    onPick={(file) => uploadImage('slide', index, file)}
                    onRemove={() => updateSlide(index, 'imageUrl', '')}
                  />

                  <div className="admin-row">
                    <fieldset className="admin-subfield">
                      <legend>Bouton pour un visiteur</legend>
                      <label>
                        Libellé
                        <input type="text" maxLength={30} value={slide.ctaLabel} onChange={(e) => updateSlide(index, 'ctaLabel', e.target.value)} />
                      </label>
                      <label>
                        Destination
                        <select value={slide.ctaTarget} onChange={(e) => updateSlide(index, 'ctaTarget', e.target.value)}>
                          {Object.entries(TARGET_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                    </fieldset>
                    <fieldset className="admin-subfield">
                      <legend>Bouton pour un compte connecté</legend>
                      <label>
                        Libellé
                        <input type="text" maxLength={30} value={slide.userCtaLabel} onChange={(e) => updateSlide(index, 'userCtaLabel', e.target.value)} />
                      </label>
                      <label>
                        Destination
                        <select value={slide.userCtaTarget} onChange={(e) => updateSlide(index, 'userCtaTarget', e.target.value)}>
                          {Object.entries(TARGET_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                    </fieldset>
                  </div>

                  <div className="admin-slide-actions">
                    <button type="button" onClick={() => moveSlide(index, -1)} disabled={index === 0}>Monter</button>
                    <button type="button" onClick={() => moveSlide(index, 1)} disabled={index === slides.length - 1}>Descendre</button>
                    <button type="button" onClick={() => removeSlide(index)} disabled={slides.length === 1}>Supprimer</button>
                  </div>
                </article>
              ))}
            </div>
            <div className="admin-actions">
              <button type="button" onClick={addSlide} disabled={slides.length >= MAX_SLIDES}>Ajouter une slide</button>
            </div>
          </section>

          <section className="admin-card">
            <h2>Cartes à droite du héros</h2>
            <p className="admin-help">Deux cartes : couleur de fond, image, titre, sous-titre et destination du clic.</p>
            <div className="admin-slides-grid">
              {sideCards.map((card, index) => (
                <article key={index} className="admin-slide-card">
                  <header className="admin-slide-head">
                    <span className="admin-slide-num">{index + 1}</span>
                    <strong>{card.title || 'Sans titre'}</strong>
                  </header>

                  <label>
                    Titre
                    <input type="text" maxLength={40} value={card.title} onChange={(e) => updateCard(index, 'title', e.target.value)} />
                  </label>
                  <label>
                    Sous-titre
                    <input type="text" maxLength={80} value={card.subtitle} onChange={(e) => updateCard(index, 'subtitle', e.target.value)} />
                  </label>

                  <div className="admin-row">
                    <label>
                      Couleur de fond
                      <input type="color" value={card.color} onChange={(e) => updateCard(index, 'color', e.target.value)} />
                    </label>
                    <label>
                      Destination du clic
                      <select value={card.target} onChange={(e) => updateCard(index, 'target', e.target.value)}>
                        {Object.entries(TARGET_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <ImageField
                    imageUrl={card.imageUrl}
                    progress={progressFor('card', index)}
                    disabled={uploading !== null}
                    onPick={(file) => uploadImage('card', index, file)}
                    onRemove={() => updateCard(index, 'imageUrl', '')}
                  />
                </article>
              ))}
            </div>
          </section>

          <section className="admin-card">
            <h2>Jeux Wynveo (rangée de l’accueil)</h2>
            <p className="admin-help">
              Image au format portrait (600 × 800 px conseillé). Elle couvre toute la carte. Sans image, la carte garde sa couleur de fond.
            </p>
            <div className="admin-slides-grid">
              {games.map((game, index) => (
                <article key={game.key || index} className="admin-slide-card">
                  <header className="admin-slide-head">
                    <span className="admin-slide-num">{index + 1}</span>
                    <strong>{game.name || 'Sans nom'}</strong>
                  </header>

                  <div className="admin-row">
                    <label>
                      Nom
                      <input type="text" maxLength={30} value={game.name} onChange={(e) => updateGame(index, 'name', e.target.value)} />
                    </label>
                    <label>
                      Description
                      <input type="text" maxLength={60} value={game.desc} onChange={(e) => updateGame(index, 'desc', e.target.value)} />
                    </label>
                  </div>

                  <div className="admin-row">
                    <label>
                      Couleur de secours
                      <input type="color" value={game.color} onChange={(e) => updateGame(index, 'color', e.target.value)} />
                    </label>
                    <label>
                      Destination du clic
                      <select value={game.target} onChange={(e) => updateGame(index, 'target', e.target.value)}>
                        {Object.entries(TARGET_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label>
                    Badge (optionnel)
                    <select value={game.badge || ''} onChange={(e) => updateGame(index, 'badge', e.target.value)}>
                      <option value="">Aucun</option>
                      <option value="Nouveau">Nouveau</option>
                      <option value="Populaire">Populaire</option>
                    </select>
                  </label>

                  <ImageField
                    imageUrl={game.imageUrl}
                    progress={progressFor('game', index)}
                    disabled={uploading !== null}
                    onPick={(file) => uploadImage('game', index, file)}
                    onRemove={() => updateGame(index, 'imageUrl', '')}
                  />
                </article>
              ))}
            </div>
          </section>

          <div className="admin-actions">
            <button type="submit" className="admin-primary" disabled={saving || uploading !== null}>
              {saving ? 'Enregistrement…' : 'Enregistrer l’accueil'}
            </button>
          </div>
        </form>
      )}
      {message && <p className="admin-ok" role="status">{message}</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
    </AdminShell>
  );
}
