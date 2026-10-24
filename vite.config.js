import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import seoPages from './tools/seo-plugin.mjs';

export default defineConfig({
  plugins: [react(), seoPages()],
});
