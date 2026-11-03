import ConnectedLayout from '../components/ConnectedLayout.jsx';

// Pages connectées pas encore conçues (Jeux, Sport, Mes Paris, Profil).
export default function Placeholder({ title }) {
  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">{title}</h1>
      <p className="note">Maquette à venir.</p>
    </ConnectedLayout>
  );
}
