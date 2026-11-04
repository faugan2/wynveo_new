// Pagination « précédent / suivant » des tableaux d'administration (curseurs côté serveur).
export default function TablePager({ page, hasPrev, hasNext, loading, onPrev, onNext }) {
  return (
    <nav className="admin-pager" aria-label="Pagination">
      <span className="admin-sub">Page {page}</span>
      <div className="admin-pager-buttons">
        <button type="button" onClick={onPrev} disabled={!hasPrev || loading}>
          Précédent
        </button>
        <button type="button" onClick={onNext} disabled={!hasNext || loading}>
          Suivant
        </button>
      </div>
    </nav>
  );
}
