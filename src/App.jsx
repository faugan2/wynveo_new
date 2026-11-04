import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Welcome from './screens/Welcome.jsx';
import Login from './screens/Login.jsx';
import Register from './screens/Register.jsx';
import ForgotPassword from './screens/ForgotPassword.jsx';
import Universe from './screens/Universe.jsx';
import Home from './screens/Home.jsx';
import Wallet from './screens/Wallet.jsx';
import Deposit from './screens/Deposit.jsx';
import DepositSuccess from './screens/DepositSuccess.jsx';
import Withdraw from './screens/Withdraw.jsx';
import Placeholder from './screens/Placeholder.jsx';
import Games, { GamePlaceholder } from './screens/Games.jsx';
import LuckySpin from './screens/LuckySpin.jsx';
import MysteryBox from './screens/MysteryBox.jsx';
import LuckyNumber from './screens/LuckyNumber.jsx';
import Jackpot from './screens/Jackpot.jsx';
import CrashGame from './screens/CrashGame.jsx';
import SportHome from './screens/SportHome.jsx';
import SportMatch from './screens/SportMatch.jsx';
import SportCoupon from './screens/SportCoupon.jsx';
import SportConfirmed from './screens/SportConfirmed.jsx';
import SportBets from './screens/SportBets.jsx';
import Profile from './screens/Profile.jsx';
import AdminPayments from './screens/Admin/AdminPayments.jsx';
import AdminGames from './screens/Admin/AdminGames.jsx';
import AdminAudit from './screens/Admin/AdminAudit.jsx';

// Pages réservées aux comptes connectés.
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

// Les écrans d'accès ne sont pas visibles une fois connecté.
function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/home" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GuestOnly><Welcome /></GuestOnly>} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
      <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
      <Route path="/univers/:name" element={<Universe />} />

      <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/portefeuille" element={<RequireAuth><Wallet /></RequireAuth>} />
      <Route path="/depot" element={<RequireAuth><Deposit /></RequireAuth>} />
      <Route path="/depot/succes" element={<RequireAuth><DepositSuccess /></RequireAuth>} />
      <Route path="/retrait" element={<RequireAuth><Withdraw /></RequireAuth>} />
      <Route path="/jeux" element={<RequireAuth><Games /></RequireAuth>} />
      <Route path="/jeux/lucky-spin" element={<RequireAuth><LuckySpin /></RequireAuth>} />
      <Route path="/jeux/mystery-box" element={<RequireAuth><MysteryBox /></RequireAuth>} />
      <Route path="/jeux/lucky-number" element={<RequireAuth><LuckyNumber /></RequireAuth>} />
      <Route path="/jeux/jackpot" element={<RequireAuth><Jackpot /></RequireAuth>} />
      <Route path="/jeux/crash" element={<RequireAuth><CrashGame /></RequireAuth>} />
      <Route path="/jeux/:slug" element={<RequireAuth><GamePlaceholder /></RequireAuth>} />
      <Route path="/sport" element={<RequireAuth><SportHome /></RequireAuth>} />
      <Route path="/sport/match/:eventId" element={<RequireAuth><SportMatch /></RequireAuth>} />
      <Route path="/sport/coupon" element={<RequireAuth><SportCoupon /></RequireAuth>} />
      <Route path="/sport/confirme" element={<RequireAuth><SportConfirmed /></RequireAuth>} />
      <Route path="/mes-paris" element={<RequireAuth><SportBets /></RequireAuth>} />
      <Route path="/profil" element={<RequireAuth><Profile /></RequireAuth>} />

      <Route path="/admin" element={<Navigate to="/admin/paiements" replace />} />
      <Route path="/admin/paiements" element={<RequireAuth><AdminPayments /></RequireAuth>} />
      <Route path="/admin/jeux" element={<RequireAuth><AdminGames /></RequireAuth>} />
      <Route path="/admin/journal" element={<RequireAuth><AdminAudit /></RequireAuth>} />

      <Route path="/historique" element={<RequireAuth><Placeholder title="Historique" /></RequireAuth>} />
      <Route path="/bonus" element={<RequireAuth><Placeholder title="Bonus et promotions" /></RequireAuth>} />
      <Route path="/jeu-responsable" element={<RequireAuth><Placeholder title="Jeu responsable" /></RequireAuth>} />
      <Route path="/aide" element={<RequireAuth><Placeholder title="Aide et support" /></RequireAuth>} />
      <Route path="/conditions" element={<RequireAuth><Placeholder title="Conditions d'utilisation" /></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
