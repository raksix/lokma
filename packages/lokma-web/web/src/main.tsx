import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
