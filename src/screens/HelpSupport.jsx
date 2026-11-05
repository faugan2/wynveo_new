import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { useHelpInfo } from '../lib/helpInfo.js';
import { formatFcfa } from '../lib/format.js';

// Aide et support. Les contacts, le dépôt minimum, la durée de validité, le bonus et le parrainage viennent des réglages.
export default function HelpSupport() {
  const { info, error } = useHelpInfo();
  const contacts = info?.support;
  const hasContact = contacts && (contacts.email || contacts.whatsapp || contacts.hours);

  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">Aide et support</h1>
      {!info && !error && <p className="hint">Chargement…</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {info && (
        <>
          <div className="section-head"><h2>Dépôts crypto</h2></div>
          <ul className="help-list">
            <li>Cryptos acceptées : USDT sur BNB Smart Chain (BEP20), et USDC sur Arbitrum. Envoyez uniquement sur le réseau indiqué.</li>
            <li>Envoyez le montant exact affiché, à la décimale près. Un autre montant peut retarder ou empêcher le crédit.</li>
            <li>Dépôt minimum : {formatFcfa(info.deposit.minDepositXof)}.</li>
            <li>Une demande de dépôt est valable {info.deposit.expiryMinutes} minutes. Passé ce délai, créez une nouvelle demande.</li>
            <li>Portefeuilles pris en charge : MetaMask, SafePal et Rainbow.</li>
          </ul>

          <div className="section-head"><h2>Mon compte</h2></div>
          <ul className="help-list">
            <li>Votre compte est vérifié à votre premier dépôt confirmé. Les retraits et le bonus de bienvenue sont réservés aux comptes vérifiés.</li>
            {info.welcomeBonus.enabled && info.welcomeBonus.amountXof > 0 && (
              <li>Bonus de bienvenue : {formatFcfa(info.welcomeBonus.amountXof)}, versé une seule fois à votre premier dépôt confirmé.</li>
            )}
            {info.referralRates.length > 0 && (
              <li>Parrainage : vous recevez un pourcentage des dépôts de vos filleuls, sur {info.referralRates.length} niveaux ({info.referralRates.join(' %, ')} %).</li>
            )}
          </ul>

          <div className="section-head"><h2>Paris sportifs</h2></div>
          <ul className="help-list">
            <li>Un pari ne peut plus être placé une fois le coup d’envoi passé.</li>
            <li>Si un match est annulé, les paris qui le concernent sont remboursés.</li>
          </ul>

          <div className="section-head"><h2>Retraits</h2></div>
          <p className="note">Les retraits seront bientôt disponibles.</p>

          <div className="section-head"><h2>Nous contacter</h2></div>
          {hasContact ? (
            <ul className="help-list">
              {contacts.email && <li>E-mail : <a href={`mailto:${contacts.email}`}>{contacts.email}</a></li>}
              {contacts.whatsapp && <li>WhatsApp : {contacts.whatsapp}</li>}
              {contacts.hours && <li>Horaires : {contacts.hours}</li>}
            </ul>
          ) : (
            <p className="note">Les coordonnées de support seront publiées prochainement.</p>
          )}
        </>
      )}
    </ConnectedLayout>
  );
}
