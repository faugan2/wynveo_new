import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Welcome from './screens/Welcome.jsx';
import Login from './screens/Login.jsx';
import Register from './screens/Register.jsx';
import ForgotPassword from './screens/ForgotPassword.jsx';
import Home from './screens/Home.jsx';
import Universe from './screens/Universe.jsx';

// Écran d'accueil réservé aux comptes connectés.
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
