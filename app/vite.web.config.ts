import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { podeEmbutir } from './src/renderer/src/embutir.ts';

/**
 * A Saga no navegador: o mesmo renderer do app instalado, com a ponte do navegador
 * (`src/renderer/web/navegador.ts`) no lugar do preload do Electron.
 *
 * Sai em `out/web`, com endereços RELATIVOS (`base: './'`): a página mora numa subpasta
 * (`/saga/app/` no GitHub Pages) e não pode pedir nada da raiz do site.
 */
const versao: string = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version;

export default defineConfig({
  root: resolve(__dirname, 'src/renderer/web'),
  base: './',
  plugins: [react()],
  define: { __VERSAO__: JSON.stringify(versao) },
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true,
    // Som nunca vira `data:`, como no app instalado: ver embutir.ts.
    assetsInlineLimit: (caminho: string) => podeEmbutir(caminho),
  },
});
