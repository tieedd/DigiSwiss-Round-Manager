import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Plugin to copy built dist files into app/src/main/assets/dist so Android WebView can load them offline
function copyToAndroidAssets() {
  return {
    name: 'copy-to-android-assets',
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'dist');
      const destDir = path.resolve(__dirname, 'app/src/main/assets/dist');
      if (fs.existsSync(srcDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.cpSync(srcDir, destDir, { recursive: true });
        console.log('Successfully copied dist to app/src/main/assets/dist');
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), copyToAndroidAssets()],
  base: './', // relative base so assets load cleanly from file:///android_asset/dist/index.html
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  }
});
