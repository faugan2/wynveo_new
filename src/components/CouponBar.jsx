import { useNavigate } from 'react-router-dom';
import { useCoupon } from '../context/CouponContext.jsx';

// Barre du coupon, en bas des écrans Sport : nombre de choix, cote totale, accès au coupon.
export default function CouponBar() {
  const navigate = useNavigate();
  const { selections, totalPrice } = useCoupon();
  if (selections.length === 0) return null;

  return (
    <button type="button" className="coupon-bar" onClick={() => navigate('/sport/coupon')}>
      <span className="coupon-count">{selections.length}</span>
      <span className="coupon-bar-text">
        <strong>Mon coupon</strong>
        <small>Cote totale {totalPrice.toFixed(2)}</small>
      </span>
      <span className="coupon-bar-go">VOIR ›</span>
    </button>
  );
}
