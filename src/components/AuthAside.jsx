// Bloc de gauche des écrans d'accès, visible seulement sur bureau (voir desktop.css).
export default function AuthAside() {
  return (
    <aside className="auth-aside">
      <div className="brand">
        WYN<span>VEO</span>
      </div>
      <h2 className="hero-title title-font">Un seul compte pour jouer et parier</h2>
      <ul className="auth-points">
        <li>Dépôts et retraits par Mobile Money ou crypto</li>
        <li>Jeux et paris sportifs dans le même portefeuille</li>
        <li>Votre compte est vérifié dès votre premier dépôt</li>
      </ul>
      <p className="footer-note" style={{ margin: 0, textAlign: 'left' }}>
        18+ · Jouez de manière responsable
      </p>
    </aside>
  );
}
