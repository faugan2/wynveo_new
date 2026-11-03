import { useEffect, useState } from 'react';
import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';
import { IoCopyOutline, IoShareSocialOutline } from 'react-icons/io5';

// Écran Profil : identité, parrainage (code et lien à partager), et réseau des filleuls.
export default function Profile() {
  const { profile } = useAuth();
  const [message, setMessage] = useState('');
  const [network, setNetwork] = useState(null);
  const [networkError, setNetworkError] = useState('');

  // Réseau : chargé une fois, depuis la fonction getMyReferrals.
  useEffect(() => {
    let active = true;
    functions
      .httpsCallable('getMyReferrals')({})
      .then(({ data }) => active && setNetwork(data))
      .catch((err) => active && setNetworkError(err?.message || 'Réseau indisponible.'));
    return () => {
      active = false;
    };
  }, []);

  const code = profile?.referralCode ?? '';
  // Le lien s'adapte à l'adresse du site (en local, en test ou en production).
  const link = code ? `${window.location.origin}/register?ref=${code}` : '';
  const initial = (profile?.fullName || '?').trim().charAt(0).toUpperCase();

  // Message de partage : code et lien. Les liens directs (WhatsApp, etc.) marchent sans API de partage.
  const shareText = `Rejoins-moi sur Wynveo ! Mon code parrain : ${code}\n${link}`;
  const encodedText = encodeURIComponent(shareText);
  const shareLinks = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodedText}` },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Rejoins-moi sur Wynveo ! Mon code parrain : ${code}`)}` },
    { label: 'SMS', href: `sms:?body=${encodedText}` },
    { label: 'E-mail', href: `mailto:?subject=${encodeURIComponent('Rejoins-moi sur Wynveo')}&body=${encodedText}` },
  ];

  // Copie avec l'API moderne si elle est disponible (adresse sécurisée : localhost ou https).
  // Sinon, repli sur une zone de texte temporaire : fonctionne aussi sur une adresse IP du réseau.
  async function copyText(text) {
    if (window.isSecureContext && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // On passe au repli ci-dessous.
      }
    }
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(field);
    return copied;
  }

  async function copy(text, label) {
    const copied = await copyText(text);
    setMessage(copied ? `${label} copié.` : 'Copie impossible. Sélectionnez le texte et copiez-le à la main.');
  }

  async function share() {
    if (!navigator.share) {
      copy(link, 'Lien');
      return;
    }
    try {
      await navigator.share({
        title: 'Wynveo',
        text: `Rejoins-moi sur Wynveo ! Mon code parrain : ${code}`,
        url: link,
      });
    } catch {
      // Partage annulé par l'utilisateur : rien à faire.
    }
  }

  return (
    <ConnectedLayout>
      <header className="profile-hero">
        <span className="profile-avatar" aria-hidden="true">{initial}</span>
        <div>
          <h1 className="title-font">{profile?.fullName ?? 'Mon profil'}</h1>
          <small>{profile?.phone ?? ''}</small>
        </div>
      </header>

      <section className="info-card">
        <div className="info-row"><span>E-mail</span><b>{profile?.email ?? '—'}</b></div>
        <div className="info-row"><span>Téléphone</span><b>{profile?.phone ?? '—'}</b></div>
        <div className="info-row">
          <span>Statut</span>
          <b className={profile?.verified ? 'positive' : 'gold'}>
            {profile?.verified ? 'Compte vérifié' : 'Non vérifié'}
          </b>
        </div>
      </section>

      <h2 className="section-title">Parrainage</h2>
      <section className="referral-card">
        <small>Votre code parrain</small>
        <div className="referral-code">{code || 'En cours de création'}</div>
        <p className="referral-help">
          Partagez votre code. Vous recevez un bonus à chaque dépôt de vos filleuls, sur 5 niveaux.
        </p>

        {code && (
          <>
            <div className="field referral-link">
              <input readOnly value={link} aria-label="Votre lien de parrainage" onFocus={(e) => e.target.select()} />
            </div>
            <div className="split-buttons">
              <button type="button" className="btn btn-outline btn-compact" onClick={() => copy(code, 'Code')}>
                <IoCopyOutline size={16} aria-hidden="true" /> Copier le code
              </button>
              <button type="button" className="btn btn-outline btn-compact" onClick={() => copy(link, 'Lien')}>
                <IoCopyOutline size={16} aria-hidden="true" /> Copier le lien
              </button>
            </div>
            <button type="button" className="btn btn-primary btn-compact btn-share" onClick={share}>
              <IoShareSocialOutline size={18} aria-hidden="true" /> Partager
            </button>
            <div className="share-links" aria-label="Partager directement">
              {shareLinks.map((item) => (
                <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className="share-link">
                  {item.label}
                </a>
              ))}
            </div>
          </>
        )}
      </section>

      {message && <p className="hint" role="status">{message}</p>}

      <h2 className="section-title">Mon réseau</h2>
      {networkError && <p className="error" role="alert">{networkError}</p>}
      {!network && !networkError && <p className="hint">Chargement…</p>}

      {network && (
        <>
          <div className="network-grid">
            {network.levels.map((level) => (
              <div key={level.level} className="network-tile">
                <small>Niveau {level.level}</small>
                <strong>{level.count}</strong>
                <span>{level.rate} %</span>
                <b className="gold">{formatFcfa(level.bonusTotal, { unit: false })}</b>
              </div>
            ))}
          </div>

          {network.members.length === 0 ? (
            <p className="note">Vous n'avez pas encore de filleul. Partagez votre lien pour commencer.</p>
          ) : (
            <ul className="member-list">
              {network.members.map((member, index) => (
                <li key={`${member.name}-${index}`} className="member-item">
                  <span className="member-avatar" aria-hidden="true">{member.name.charAt(0)}</span>
                  <div>
                    <strong>{member.name}</strong>
                    <small>Niveau {member.level}</small>
                  </div>
                  <b className="gold">{formatFcfa(member.bonusGenerated)}</b>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ConnectedLayout>
  );
}
