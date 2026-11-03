import { useEffect } from 'react';

// Feuille qui monte depuis le bas de l'écran. Se ferme avec le bouton, la zone sombre ou la touche Échap.
export default function BottomSheet({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    // Bloque le défilement de la page derrière la feuille.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheet-layer">
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <h2 className="title-font">{title}</h2>
          <button type="button" className="back-button" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-footer">{footer}</footer>}
      </section>
    </div>
  );
}
