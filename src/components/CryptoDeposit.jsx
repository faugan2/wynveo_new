import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectButton, useActiveAccount, useSendTransaction } from 'thirdweb/react';
import { getContract } from 'thirdweb';
import { transfer } from 'thirdweb/extensions/erc20';
import { CHAINS_BY_NETWORK, thirdwebClient } from '../lib/thirdweb.js';
import { WALLETS } from '../config/wallets.js';
import { functions } from '../lib/firebase.js';
import { formatFcfa } from '../lib/format.js';

const TOKENS = [
  { symbol: 'USDT', label: 'USDT', network: 'bsc', networkLabel: 'BNB Smart Chain (BEP20)' },
  { symbol: 'USDC', label: 'USDC', network: 'arbitrum', networkLabel: 'Arbitrum One' },
];
const POLL_MS = 5000;
// Valeur de repli, le temps que les réglages arrivent du serveur (wy_settings/payments).
const FALLBACK_MIN_DEPOSIT = 1000;

const STEPS = ['Montant', 'Paiement', 'Confirmation'];

// Adresse courte au milieu : 0x55d398…7955.
const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const ADDRESS_TEXT = /^0x[0-9a-fA-F]{40}$/;

// Format mm:ss pour le compte à rebours.
function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${String(minutes).padStart(2, '0')}:${rest}`;
}

// Étapes affichées en haut : la progression suit l'avancement réel du dépôt.
function Stepper({ current }) {
  return (
    <ol className="crypto-stepper" aria-label="Progression du dépôt">
      {STEPS.map((label, index) => {
        const state = index < current ? 'is-done' : index === current ? 'is-active' : '';
        return (
          <li key={label} className={`crypto-step ${state}`}>
            <span className="crypto-step-dot">{index < current ? '✓' : index + 1}</span>
            <span className="crypto-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Dépôt crypto : montant en FCFA, demande côté serveur, paiement avec le portefeuille, puis vérification serveur.
export default function CryptoDeposit() {
  const navigate = useNavigate();
  const account = useActiveAccount();
  // Transfert direct depuis le portefeuille (pas de conversion, pas de sélecteur de token).
  const { mutate: sendTransfer, isPending: paying } = useSendTransaction({ payModal: false });
  const [settings, setSettings] = useState(null); // minDepositXof, rateXofPerUsd, expiryMinutes
  const [amount, setAmount] = useState(5000);
  const [tokenSymbol, setTokenSymbol] = useState('USDT');
  const [request, setRequest] = useState(null); // réponse de createCryptoDeposit
  const [status, setStatus] = useState(''); // '', 'pending', 'confirming', 'credited'
  const [confirmations, setConfirmations] = useState(null);
  const [requiredConfirmations, setRequiredConfirmations] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef(null);

  const token = TOKENS.find((item) => item.symbol === tokenSymbol);
  const minDeposit = settings?.minDepositXof ?? FALLBACK_MIN_DEPOSIT;
  const amountOk = Number.isInteger(amount) && amount >= minDeposit;
  const remaining = request ? Math.max(0, Math.floor((request.expiresAt - now) / 1000)) : 0;
  const expired = Boolean(request) && remaining === 0 && status !== 'credited';
  const currentStep = request ? (status === 'pending' || status === 'confirming' ? 2 : 1) : 0;

  // Arrête la vérification automatique quand le composant disparaît.
  useEffect(() => () => clearInterval(pollRef.current), []);

  // Adresses de la carte de transaction : on ajoute seulement une version courte en attribut (le texte reste intact).
  useEffect(() => {
    const annotate = () => {
      document.querySelectorAll('.crypto-tx-widget a').forEach((link) => {
        const text = link.textContent.trim();
        if (!ADDRESS_TEXT.test(text)) return;
        const short = shortAddress(text);
        if (link.dataset.short !== short) {
          link.dataset.short = short;
          link.title = text;
        }
      });
    };
    annotate();
    const observer = new MutationObserver(annotate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Horloge pour le compte à rebours.
  useEffect(() => {
    if (!request) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [request]);

  // Réglages modifiables par l'admin (minimum, taux, durée), lus depuis le serveur.
  useEffect(() => {
    functions
      .httpsCallable('getCryptoDepositSettings')({})
      .then(({ data }) => setSettings(data))
      .catch(() => setSettings({ minDepositXof: FALLBACK_MIN_DEPOSIT, rateXofPerUsd: null, expiryMinutes: null }));
  }, []);

  async function createRequest() {
    setError('');
    setBusy(true);
    try {
      const { data } = await functions.httpsCallable('createCryptoDeposit')({ amountXof: amount, token: tokenSymbol });
      setRequest(data);
      setStatus('');
      setNow(Date.now());
    } catch (err) {
      setError(err?.message || 'Demande impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  // Envoie le hash au serveur, qui vérifie la transaction. Le navigateur ne crédite jamais rien.
  async function confirm(txHash) {
    try {
      const { data } = await functions.httpsCallable('confirmCryptoDeposit')({ depositId: request.depositId, txHash });
      applyStatus(data);
      if (data.status !== 'credited') startPolling(txHash);
    } catch (err) {
      setError(err?.message || 'Vérification impossible. Réessayez.');
    }
  }

  // Le portefeuille signe le transfert direct ; le hash part ensuite au serveur pour vérification.
  function payNow() {
    if (!transaction) return;
    setError('');
    sendTransfer(transaction, {
      onSuccess: (receipt) => {
        const txHash = receipt?.transactionHash;
        if (txHash) confirm(txHash);
        else setError('Hash de transaction introuvable.');
      },
      onError: (err) => setError(err?.message || 'Paiement annulé ou échoué.'),
    });
  }

  function applyStatus(data) {
    setStatus(data.status);
    setConfirmations(data.status === 'confirming' ? data.confirmations : null);
    setRequiredConfirmations(data.status === 'confirming' ? data.required : requiredConfirmations);
    if (data.status === 'credited') {
      clearInterval(pollRef.current);
      navigate('/depot/succes', { state: { amount: data.amountXof, method: 'Crypto ' + tokenSymbol, result: null } });
    }
  }

  function startPolling(txHash) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await functions.httpsCallable('confirmCryptoDeposit')({ depositId: request.depositId, txHash });
        applyStatus(data);
      } catch (err) {
        setError(err?.message || 'Vérification interrompue. Réessayez.');
        clearInterval(pollRef.current);
      }
    }, POLL_MS);
  }

  function copy(value, label) {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1800);
    });
  }

  // Transaction : transfert du token vers l'adresse admin, au montant exact de la demande.
  const transaction = (() => {
    if (!request) return null;
    const chain = CHAINS_BY_NETWORK[request.network];
    const contract = getContract({ client: thirdwebClient, chain, address: request.tokenAddress });
    return transfer({ contract, to: request.toAddress, amount: request.amount });
  })();

  return (
    <section className="crypto-deposit">
      <Stepper current={currentStep} />

      {!request && (
        <div className="crypto-card">
          <h2 className="crypto-title">Montant du dépôt</h2>
          <p className="crypto-subtitle">Choisissez le montant en FCFA et la crypto à envoyer.</p>

          <label className="crypto-field">
            <span>Montant en FCFA</span>
            <div className="crypto-amount">
              <input
                type="number"
                inputMode="numeric"
                min={minDeposit}
                step={500}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
              <span>FCFA</span>
            </div>
          </label>
          <p className={`crypto-hint ${amountOk ? '' : 'is-warning'}`}>
            {amountOk ? `Minimum ${formatFcfa(minDeposit)}` : `Le montant minimum est ${formatFcfa(minDeposit)}.`}
            {settings?.rateXofPerUsd ? ` · Taux : 1 USD = ${settings.rateXofPerUsd} FCFA` : ''}
          </p>

          <span className="crypto-label">Crypto</span>
          <div className="crypto-tokens" role="radiogroup" aria-label="Crypto">
            {TOKENS.map((item) => (
              <button
                key={item.symbol}
                type="button"
                role="radio"
                aria-checked={tokenSymbol === item.symbol}
                className={`crypto-token${tokenSymbol === item.symbol ? ' is-selected' : ''}`}
                onClick={() => setTokenSymbol(item.symbol)}
              >
                <strong>{item.label}</strong>
                <small>{item.networkLabel}</small>
              </button>
            ))}
          </div>

          <button type="button" className="btn btn-sport crypto-primary" onClick={createRequest} disabled={!amountOk || busy}>
            {busy ? 'Préparation…' : 'Continuer'}
          </button>
        </div>
      )}

      {request && status !== 'credited' && (
        <div className="crypto-card">
          <div className="crypto-amount-due">
            <span>Montant exact à envoyer</span>
            <strong>
              {request.amount} <small>{tokenSymbol}</small>
            </strong>
          </div>

          <dl className="crypto-details">
            <div>
              <dt>Réseau</dt>
              <dd>{token?.networkLabel}</dd>
            </div>
            <div>
              <dt>Soit</dt>
              <dd>{formatFcfa(request.amountXof ?? amount)}</dd>
            </div>
            <div>
              <dt>Adresse de réception</dt>
              <dd className="crypto-address">
                <span>{request.toAddress}</span>
                <button type="button" className="crypto-copy" onClick={() => copy(request.toAddress, 'address')}>
                  {copied === 'address' ? 'Copiée ✓' : 'Copier'}
                </button>
              </dd>
            </div>
            <div>
              <dt>Temps restant</dt>
              <dd className={remaining < 300 ? 'is-warning' : ''}>{formatCountdown(remaining)}</dd>
            </div>
          </dl>

          <p className="crypto-warning">
            Envoyez exactement ce montant, sur le réseau indiqué. Un montant différent ou un autre réseau ne sera pas crédité.
          </p>

          {expired && (
            <p className="error" role="alert">La demande a expiré. Créez une nouvelle demande.</p>
          )}

          {!expired && !account && (
            <div className="crypto-connect">
              <p>Connectez votre portefeuille pour payer.</p>
              <ConnectButton
                client={thirdwebClient}
                wallets={WALLETS}
                connectModal={{ showThirdwebBranding: false }}
              />
            </div>
          )}

          {!expired && account && transaction && status === '' && (
            <div className="crypto-pay">
              <p className="crypto-pay-note">
                Votre portefeuille va demander de signer un transfert direct de <strong>{request.amount} {tokenSymbol}</strong> vers l'adresse de réception.
              </p>
              <button type="button" className="btn btn-sport crypto-primary" onClick={payNow} disabled={paying}>
                {paying ? 'Confirmez dans votre portefeuille…' : `Payer ${request.amount} ${tokenSymbol}`}
              </button>
            </div>
          )}

          {status === 'pending' && (
            <div className="crypto-progress" role="status">
              <span className="crypto-spinner" aria-hidden="true" />
              <div>
                <strong>Transaction détectée</strong>
                <small>Nous attendons qu'elle soit visible sur la blockchain.</small>
              </div>
            </div>
          )}

          {status === 'confirming' && (
            <div className="crypto-progress" role="status">
              <span className="crypto-spinner" aria-hidden="true" />
              <div>
                <strong>Confirmation en cours</strong>
                <small>
                  {confirmations} / {requiredConfirmations} confirmations
                </small>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="error crypto-error" role="alert">{error}</p>}
    </section>
  );
}
