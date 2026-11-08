import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../assets/app.css';
import { PRODUCT_NAME } from '../../lib/constants';
import { NewTabApp } from './NewTabApp';

document.title = PRODUCT_NAME;

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <NewTabApp />
  </React.StrictMode>
);
