import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { startWallApparitions, liveApparitions } from './wallApparitions.js';
import { startGhost } from './ghost.js';
import { startStudioLink } from './lib/studioLink.js';

createRoot(document.getElementById('shelf-root')).render(<App />);

startWallApparitions();
// The owner's Studio link in the top-right nav: it asks who is signed in and adds the entry only for the owner.
// Not awaited, and it never throws, so a failure there cannot stop the ghost below.
startStudioLink();
// The ghost asks where the apparitions are so he can be startled by one. Passed
// in rather than imported inside ghost.js, so he keeps working -- just never
// startled -- if the apparitions are ever disabled or fail to start.
startGhost(liveApparitions);
