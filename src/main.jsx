import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { startWallApparitions } from './wallApparitions.js';

createRoot(document.getElementById('shelf-root')).render(<App />);

startWallApparitions();
