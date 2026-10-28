import { useAuth } from '../context/AuthContext.jsx';

// Bandeau léger affiché tant que le compte n'a pas fait de premier dépôt.
export default function VerificationBanner() {
  const { isVerified, loading } = useAuth();
  if (loading || isVerified) return null;

  return (
    <div className="banner-warning" role="status">
      <span aria-hidden="true">⚠️</span>
      <span>
        Compte non vérifié. Effectuez votre premier dépôt Mobile Money pour débloquer les retraits et le bonus.
      </span>
    </div>
  );
}
