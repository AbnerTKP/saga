import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        /**
         * Duas páginas: a Saga e o overlay da live, que vive numa janela à parte — sem
         * moldura, acima de tudo e com o clique atravessando para o jogo. Sem esta
         * entrada, `overlay.html` simplesmente não vai para o `out/` e a janela abre em
         * branco no app instalado, funcionando aqui em desenvolvimento — o pior dos dois
         * mundos.
         */
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
        },
      },
    },
  },
});
