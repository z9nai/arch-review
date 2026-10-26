import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { StoreProvider } from './store';
import { AuthProvider } from './auth';

// In einem versteckten iframe (stille Token-Erneuerung durch MSAL) die App
// NICHT starten: Das Hauptfenster liest die Antwort selbst aus der iframe-URL.
// Würde die App hier hochfahren, verbraucht sie die Antwort und das Hauptfenster
// läuft in «timed_out» / «block_iframe_reload».
// Nachladen eines Programmteils fehlgeschlagen (z. B. PDF-Export): GitHub Pages
// liefert direkt nach einem Deployment kurz 503, oder eine neue Version hat andere
// Dateinamen. Der Browser merkt sich den Fehler bis zum Neuladen — ein zweiter
// Klick hilft nicht. Ungespeicherte Änderungen schützt die beforeunload-Warnung.
let reloadOffered = false;
window.addEventListener('vite:preloadError', () => {
  if (reloadOffered) return;
  reloadOffered = true;
  if (window.confirm('Ein Programmteil konnte nicht geladen werden (Server kurz nicht erreichbar oder neue Version).\n\nSeite jetzt neu laden?')) {
    window.location.reload();
  } else reloadOffered = false;
});

if (window.self !== window.top) {
  document.getElementById('root')!.textContent = '';
} else ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AuthProvider>
  </React.StrictMode>
);
