// Configuração do vite SÓ para as fotos: serve o renderer da Saga num navegador comum.
//
// - root = app/src/renderer, com o plugin do React do próprio projeto.
// - cacheDir fora do repositório (o padrão escreveria em app/node_modules/.vite).
// - hmr desligado: sem ele o plugin do React não injeta o preâmbulo inline que o CSP da
//   página (script-src 'self') barraria; e nada fica vigiando os arquivos do repositório.
// - O endereço do servidor é trocado NA HORA de servir o api.ts ('localhost:3001', o de
//   desenvolvimento) pelo servidor local das fotos. O arquivo do repositório não muda.
import react from '/Users/loki/Documents/app-comunicacao/app/node_modules/@vitejs/plugin-react/dist/index.js';

const RAIZ = process.env.SAGA_RAIZ ?? '/Users/loki/Documents/app-comunicacao';
const PORTA_SAGA = process.env.PORTA_SAGA ?? '3901';
const PORTA_VITE = Number(process.env.PORTA_VITE ?? 5901);

export default {
  root: `${RAIZ}/app/src/renderer`,
  cacheDir: process.env.VITE_CACHE ?? '/tmp/saga-fotos-vite-cache',
  clearScreen: false,
  plugins: [
    react(),
    {
      name: 'saga-fotos-servidor-local',
      enforce: 'pre',
      transform(code, id) {
        if (!id.split('?')[0].endsWith('/src/renderer/src/api.ts')) return null;
        if (!code.includes("'localhost:3001'")) {
          throw new Error("api.ts não tem mais 'localhost:3001' — ajuste a troca em vite.config.mjs");
        }
        return { code: code.replace("'localhost:3001'", `'127.0.0.1:${PORTA_SAGA}'`), map: null };
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: PORTA_VITE,
    strictPort: true,
    hmr: false,
    watch: null,
  },
};
