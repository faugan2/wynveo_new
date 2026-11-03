import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import 'flag-icons/css/flag-icons.min.css';
// Ordre important : chaque feuille complète la précédente. Les feuilles tablette et bureau
// viennent en dernier, pour pouvoir remplacer les règles de téléphone.
import './styles/global.css';
import './styles/mobile.css';
import './styles/connected.css';
import './styles/tablet.css';
import './styles/desktop.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
