import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Load cloud API adapter for web deployment (injects window.electronAPI)
import './cloudAPI.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
