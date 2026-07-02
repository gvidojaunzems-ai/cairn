import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './error-boundary';
import './styles/global.css';

// Business rule: the renderer root is the single mount point declared in
// index.html. If it is missing, the bundle is being served against the wrong
// document — fail fast rather than silently rendering nothing.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Cairn renderer bootstrap: #root element not found in document.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
