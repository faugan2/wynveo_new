import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatFcfa } from '../lib/format.js';
import { walletFromProfile } from '../lib/wallet.js';

// Bonus et promotions : solde bonus, bonus de bienvenue, code de parrainage.
export default function Bonus() {
  const { profile } = useAuth();
  const wallet = walletFromProfile(profile);
  const welcomeAmount = profile?.welcomeBonusAmount ?? 0;

  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">Bonus et promotions</h1>

      <section className="wallet-card">
        <small>Solde bonus</small>
        <div className="balance-amount big">
          {formatFcfa(wallet.bonus, { unit: false })} <span>FCFA</span>
        </div>
        <p className="note">Le solde bonus sert à miser. Il ne peut pas être retiré.</p>
      </section>

      <div className="section-head">
        <h2>Bonus de bienvenue</h2>
      </div>
      {welcomeAmount > 0 ? (
        <p className="note">
          Vous avez reçu {formatFcfa(welcomeAmount)} à votre premier dépôt confirmé.
        </p>
      ) : (
        <p className="note">
          Le bonus de bienvenue est versé une seule fois, à votre premier dépôt confirmé. Il est crédité sur le solde bonus.
        </p>
      )}

      <div className="section-head">
        <h2>Parrainage</h2>
      </div>
      <p className="note">
        Vous recevez un bonus à chaque dépôt de vos filleuls, sur 5 niveaux. Votre code :{' '}
        <b>{profile?.referralCode || '—'}</b>
      </p>
      <p className="note">Le détail de votre réseau et des bonus reçus est dans votre profil.</p>
    </ConnectedLayout>
  );
}
