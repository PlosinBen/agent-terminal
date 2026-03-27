import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ServiceProvider } from './service';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ServiceProvider>
      <App />
    </ServiceProvider>
  </React.StrictMode>,
);
