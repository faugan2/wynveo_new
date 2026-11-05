import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
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
import History from './screens/History.jsx';
import Bonus from './screens/Bonus.jsx';
import Terms from './screens/Terms.jsx';
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
import MyBets from './screens/MyBets.jsx';
import BetDetail from './screens/BetDetail.jsx';
import Profile from './screens/Profile.jsx';
import AdminPayments from './screens/Admin/AdminPayments.jsx';
import AdminGames from './screens/Admin/AdminGames.jsx';
import AdminAudit from './screens/Admin/AdminAudit.jsx';
import AdminUsers from './screens/Admin/AdminUsers.jsx';
import AdminUser from './screens/Admin/AdminUser.jsx';
import AdminTransactions from './screens/Admin/AdminTransactions.jsx';
import AdminSport from './screens/Admin/AdminSport.jsx';
import AdminBets from './screens/Admin/AdminBets.jsx';
import AdminAdmins from './screens/Admin/AdminAdmins.jsx';
import AdminPromotions from './screens/Admin/AdminPromotions.jsx';
import AdminReports from './screens/Admin/AdminReports.jsx';
import AdminLeagues from './screens/Admin/AdminLeagues.jsx';
import AdminSupport from './screens/Admin/AdminSupport.jsx';
import AdminHome from './screens/Admin/AdminHome.jsx';
import HelpSupport from './screens/HelpSupport.jsx';
import ResponsibleGaming from './screens/ResponsibleGaming.jsx';

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

// Remonte en haut de page à chaque changement de page (lien, bouton, bouton retour).
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
    <ScrollToTop />
    <Routes>
      {/* L'accueil visiteur reste accessible aux comptes connectés : il s'adapte (bouton Mon espace). */}
      <Route path="/" element={<Welcome />} />
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
      {/* Détail d'un match : accessible sans connexion (le visiteur voit le match, une cote renvoie vers la connexion). */}
      <Route path="/sport/match/:eventId" element={<SportMatch />} />
      <Route path="/sport/coupon" element={<RequireAuth><SportCoupon /></RequireAuth>} />
      <Route path="/sport/confirme" element={<RequireAuth><SportConfirmed /></RequireAuth>} />
      <Route path="/mes-paris" element={<RequireAuth><MyBets /></RequireAuth>} />
      <Route path="/mes-paris/sport/:betId" element={<RequireAuth><BetDetail /></RequireAuth>} />
      <Route path="/profil" element={<RequireAuth><Profile /></RequireAuth>} />

      <Route path="/admin" element={<Navigate to="/admin/paiements" replace />} />
      <Route path="/admin/transactions" element={<RequireAuth><AdminTransactions /></RequireAuth>} />
      <Route path="/admin/matchs" element={<RequireAuth><AdminSport /></RequireAuth>} />
      <Route path="/admin/paris" element={<RequireAuth><AdminBets /></RequireAuth>} />
      <Route path="/admin/admins" element={<RequireAuth><AdminAdmins /></RequireAuth>} />
      <Route path="/admin/promotions" element={<RequireAuth><AdminPromotions /></RequireAuth>} />
      <Route path="/admin/rapports" element={<RequireAuth><AdminReports /></RequireAuth>} />
      <Route path="/admin/competitions" element={<RequireAuth><AdminLeagues /></RequireAuth>} />
      <Route path="/admin/support" element={<RequireAuth><AdminSupport /></RequireAuth>} />
      <Route path="/admin/accueil" element={<RequireAuth><AdminHome /></RequireAuth>} />
      <Route path="/admin/paiements" element={<RequireAuth><AdminPayments /></RequireAuth>} />
      <Route path="/admin/jeux" element={<RequireAuth><AdminGames /></RequireAuth>} />
      <Route path="/admin/journal" element={<RequireAuth><AdminAudit /></RequireAuth>} />
      <Route path="/admin/utilisateurs" element={<RequireAuth><AdminUsers /></RequireAuth>} />
      <Route path="/admin/utilisateurs/:uid" element={<RequireAuth><AdminUser /></RequireAuth>} />

      <Route path="/historique" element={<RequireAuth><History /></RequireAuth>} />
      <Route path="/bonus" element={<RequireAuth><Bonus /></RequireAuth>} />
      <Route path="/jeu-responsable" element={<RequireAuth><ResponsibleGaming /></RequireAuth>} />
      <Route path="/aide" element={<RequireAuth><HelpSupport /></RequireAuth>} />
      <Route path="/conditions" element={<RequireAuth><Terms /></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
