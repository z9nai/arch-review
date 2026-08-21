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
