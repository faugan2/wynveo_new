import { useEffect, useState } from 'react';

// Message temporaire, affiché en bas de l'écran pendant quelques secondes.
export function useToast(duration = 2500) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), duration);
    return () => clearTimeout(timer);
  }, [message, duration]);

  return {
    show: setMessage,
    view: message ? (
      <div className="toast" role="status">
        {message}
      </div>
    ) : null,
  };
}
