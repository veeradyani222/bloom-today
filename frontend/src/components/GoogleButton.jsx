import { useEffect, useRef, useState } from 'react';

export function GoogleButton({ onCredential, disabled }) {
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Missing VITE_GOOGLE_CLIENT_ID in frontend .env');
      return;
    }

    const scriptId = 'google-identity-script';
    let cancelled = false;

    function renderButton() {
      if (cancelled || !buttonRef.current || !window.google?.accounts?.id) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          if (credential) {
            onCredential(credential);
          }
        },
      });

      buttonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 280,
      });
      setReady(true);
    }

    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
      if (window.google?.accounts?.id) {
        renderButton();
      } else {
        existingScript.addEventListener('load', renderButton);
        existingScript.addEventListener('error', () => setError('Could not load Google Identity script.'));
      }
    } else {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', renderButton);
      script.addEventListener('error', () => setError('Could not load Google Identity script.'));
      document.body.appendChild(script);
    }

    const safetyTimer = window.setTimeout(() => {
      if (!cancelled && !window.google?.accounts?.id) {
        setError('Google sign-in is taking too long to load. Check your network and try again.');
      }
    }, 10000);

    if (window.google?.accounts?.id) {
      renderButton();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
      const script = document.getElementById(scriptId);
      if (script) {
        script.removeEventListener('load', renderButton);
      }
    };
  }, [onCredential]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={buttonRef} className={disabled ? 'opacity-50 pointer-events-none' : ''} />
      {!ready && !error && (
        <p className="text-warm-500 text-sm">Loading sign-in…</p>
      )}
      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}
    </div>
  );
}
