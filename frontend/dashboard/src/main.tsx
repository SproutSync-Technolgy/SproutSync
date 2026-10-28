import React from 'react';
import {createRoot} from 'react-dom/client';
import {configurationError} from './config';
import './styles.css';
import './workspace.css';
const root = createRoot(document.getElementById('root')!);
const error = configurationError();
if (error) {
  root.render(<main className="account-page"><section className="account-card" role="alert">
    <h1>SproutSync setup is incomplete</h1>
    <p>{error}</p>
    <p>Follow SETUP.md in the repository for installation and configuration.</p>
  </section></main>);
} else {
  void import('./App').then(({App}) => {
    root.render(<React.StrictMode><App/></React.StrictMode>);
  }).catch(() => {
    root.render(<main className="account-page"><section className="account-card" role="alert">
      <h1>SproutSync could not load</h1><p>Reload the page. If this continues, check the development server logs.</p>
    </section></main>);
  });
}
