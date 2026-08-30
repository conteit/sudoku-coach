import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const root = createRoot(document.getElementById('root')!);

// The component gallery is the UI layer's review surface, not a screen of the
// app. Loading it dynamically behind `import.meta.env.DEV` keeps it — and the
// fixtures it renders — out of the production bundle entirely.
if (import.meta.env.DEV && window.location.hash === '#gallery') {
  void import('./ui/gallery/Gallery').then(({ Gallery }) => {
    root.render(
      <StrictMode>
        <Gallery />
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
