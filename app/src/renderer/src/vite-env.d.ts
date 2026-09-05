// Tipos do Vite só para o renderer. Sem isto, `import.meta.env.DEV` — usado em api.ts
// para apontar ao servidor local em desenvolvimento — não existe para o TypeScript.
// Fica como referência em vez de entrar em "types" do tsconfig, que valeria também
// para o processo principal e o preload, onde o Vite não roda.
/// <reference types="vite/client" />
