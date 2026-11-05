import ConnectedLayout from '../components/ConnectedLayout.jsx';
import { TERMS } from '../content/terms.js';

// Conditions d'utilisation, pour les comptes connectés. Le texte vient de content/terms.js.
export default function Terms() {
  return (
    <ConnectedLayout>
      <h1 className="title-font page-title">{TERMS.title}</h1>
      <p className="sheet-notice">{TERMS.draftNotice}</p>
      {TERMS.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph, index) => (
            <p key={index} className="note">{paragraph}</p>
          ))}
        </section>
      ))}
    </ConnectedLayout>
  );
}
