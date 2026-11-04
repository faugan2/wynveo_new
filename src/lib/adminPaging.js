import { useCallback, useEffect, useRef, useState } from 'react';

// Pagination par curseur pour les listes d'administration. Le serveur ne lit que la page demandée.
// loadPage(cursor) renvoie { items, next } ; next vaut null sur la dernière page.
// resetKey : quand il change (recherche, filtre), la liste repart à la première page.
export function useCursorPaging(loadPage, resetKey) {
  const [state, setState] = useState({ items: null, error: '', page: 1, hasNext: false, loading: false });
  const cursors = useRef([null]); // cursors[i] : curseur de la page i + 1
  const loaderRef = useRef(loadPage);
  const requestRef = useRef(0);
  loaderRef.current = loadPage;

  const fetchPage = useCallback((index) => {
    const requestId = ++requestRef.current;
    setState((s) => ({ ...s, loading: true, error: '' }));
    loaderRef.current(cursors.current[index])
      .then((result) => {
        if (requestId !== requestRef.current) return;
        cursors.current[index + 1] = result.next;
        setState({ items: result.items, error: '', page: index + 1, hasNext: Boolean(result.next), loading: false });
      })
      .catch((err) => {
        if (requestId !== requestRef.current) return;
        setState((s) => ({ ...s, loading: false, error: err?.message || 'Lecture impossible.' }));
      });
  }, []);

  useEffect(() => {
    cursors.current = [null];
    fetchPage(0);
  }, [resetKey, fetchPage]);

  return {
    items: state.items,
    error: state.error,
    page: state.page,
    loading: state.loading,
    hasPrev: state.page > 1,
    hasNext: state.hasNext,
    prev: () => fetchPage(state.page - 2),
    next: () => fetchPage(state.page),
  };
}
