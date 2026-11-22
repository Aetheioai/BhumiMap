import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register offline service worker cleanly without blocking render
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);
