import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { useHelpInfo } from '../lib/helpInfo.js';

// Jeu responsable. La ligne d'aide et l'e-mail viennent des réglages de l'admin.
export default function ResponsibleGaming() {
  const { info, error } = useHelpInfo();
  const support = info?.support;

  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">Jeu responsable</h1>
      {!info && !error && <p className="hint">Chargement…</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {info && (
        <>
          <p className="note">
            Wynveo est un divertissement. Le jeu peut devenir un problème, et nous voulons que chacun joue en gardant le contrôle.
          </p>

          <div className="section-head"><h2>Quelques règles simples</h2></div>
          <ul className="help-list">
            <li>Réservé aux adultes : l’accès est réservé aux personnes âgées de 18 ans ou plus.</li>
            <li>Jouez avec ce que vous pouvez perdre. Ne misez jamais l’argent destiné à vos dépenses essentielles.</li>
            <li>Fixez-vous à l’avance un budget et un temps de jeu.</li>
            <li>Ne jouez jamais pour rattraper une perte : une série de pertes n’est pas une raison de miser davantage.</li>
          </ul>

          <div className="section-head"><h2>Signes d’alerte</h2></div>
          <ul className="help-list">
            <li>Jouer plus longtemps ou plus souvent que prévu.</li>
            <li>Mentir sur ses pertes ou sur son temps de jeu.</li>
            <li>Emprunter de l’argent pour jouer.</li>
            <li>Se sentir mal ou anxieux quand on ne joue pas.</li>
          </ul>

          <div className="section-head"><h2>Besoin d’aide ?</h2></div>
          {support?.helpline || support?.email ? (
            <ul className="help-list">
              {support.helpline && <li>Ligne d’écoute : {support.helpline}</li>}
              {support.email && <li>E-mail : <a href={`mailto:${support.email}`}>{support.email}</a></li>}
            </ul>
          ) : (
            <p className="note">Les coordonnées d’aide seront publiées prochainement.</p>
          )}

          <p className="note">Rappel : Wynveo ne garantit aucun gain. Les jeux et les paris comportent un risque de perte.</p>
        </>
      )}
    </ConnectedLayout>
  );
}
