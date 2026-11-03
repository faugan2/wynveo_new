import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// Coupon de paris, partagé entre l'accueil Sport, les matchs et le coupon.
// Un seul choix par match. Combiné : 2 à 10 matchs.
const CouponContext = createContext(null);
export const MAX_COMBO_LEGS = 10;

export function CouponProvider({ children }) {
  const [selections, setSelections] = useState([]);
  const [mode, setMode] = useState('single');
  const [stake, setStake] = useState(1000);
  const [acceptChanges, setAcceptChanges] = useState(false);

  // Ajoute le choix, ou le retire si on reclique dessus. Un autre choix du même match le remplace.
  const toggle = useCallback((selection) => {
    setSelections((current) => {
      const same = current.find((item) => item.eventId === selection.eventId && item.pick === selection.pick);
      if (same) return current.filter((item) => item !== same);
      const others = current.filter((item) => item.eventId !== selection.eventId);
      if (mode === 'combo' && others.length >= MAX_COMBO_LEGS) return current;
      return [...others, selection];
    });
  }, [mode]);

  const remove = useCallback((eventId) => {
    setSelections((current) => current.filter((item) => item.eventId !== eventId));
  }, []);

  // Met à jour les cotes après un changement signalé par le serveur.
  const updatePrices = useCallback((changes) => {
    setSelections((current) =>
      current.map((item) => {
        const change = changes.find((entry) => entry.eventId === item.eventId && entry.pick === item.pick);
        return change ? { ...item, price: change.newPrice } : item;
      })
    );
  }, []);

  const clear = useCallback(() => setSelections([]), []);

  const value = useMemo(() => {
    const totalPrice = selections.reduce((product, item) => product * item.price, 1);
    return {
      selections,
      mode,
      setMode: (next) => {
        setMode(next);
        if (next === 'single') return;
        setSelections((current) => current.slice(0, MAX_COMBO_LEGS));
      },
      stake,
      setStake,
      acceptChanges,
      setAcceptChanges,
      toggle,
      remove,
      updatePrices,
      clear,
      totalPrice: Math.round(totalPrice * 100) / 100,
    };
  }, [selections, mode, stake, acceptChanges, toggle, remove, updatePrices, clear]);

  return <CouponContext.Provider value={value}>{children}</CouponContext.Provider>;
}

export function useCoupon() {
  const context = useContext(CouponContext);
  if (!context) throw new Error('useCoupon doit être utilisé dans CouponProvider');
  return context;
}
