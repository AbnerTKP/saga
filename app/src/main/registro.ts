import { app, ipcMain, shell, clipboard } from 'electron';
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EOL } from 'node:os';
import { limparSegredos } from './segredos';

/**
 * Registro de erros em arquivo, para quem tem problema poder mostrar o que aconteceu
 * em vez de descrever. Fica em texto puro e legível: quem abrir precisa entender sem
 * ferramenta nenhuma.
 */
const LIMITE = 512 * 1024;   // acima disso, o arquivo atual vira ".anterior"

let arquivo = '';

const agora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export function registrar(nivel: 'erro' | 'aviso' | 'info', origem: string, mensagem: string) {
  const linha = `${agora()} [${nivel}] ${origem}: ${limparSegredos(mensagem)}${EOL}`;
  try {
    if (arquivo) appendFileSync(arquivo, linha);
  } catch { /* sem disco, sem log; não é motivo para derrubar o app */ }
  if (nivel === 'erro') console.error(linha.trim());
}

export function iniciarRegistro() {
  const pasta = join(app.getPath('userData'), 'registro');
  try {
    mkdirSync(pasta, { recursive: true });
    arquivo = join(pasta, 'cantinho.log');
    // Uma rotação só: o arquivo atual e o anterior. Mais que isso não ajuda ninguém.
    if (existsSync(arquivo) && statSync(arquivo).size > LIMITE) {
      renameSync(arquivo, join(pasta, 'cantinho.anterior.log'));
    }
  } catch { arquivo = ''; }

  // Cabeçalho: sem isto, um log compartilhado não diz de qual versão nem de qual sistema veio.
  registrar('info', 'app', `--- abriu | versão ${app.getVersion()} | ${process.platform} ${process.getSystemVersion()} | electron ${process.versions.electron} ---`);

  process.on('uncaughtException', (e) => registrar('erro', 'principal', `${e.message}\n${e.stack ?? ''}`));
  process.on('unhandledRejection', (e) => registrar('erro', 'principal', String(e instanceof Error ? `${e.message}\n${e.stack}` : e)));

  ipcMain.handle('log:escrever', (_e, nivel: 'erro' | 'aviso' | 'info', origem: string, mensagem: string) => {
    registrar(nivel === 'erro' || nivel === 'aviso' ? nivel : 'info', String(origem).slice(0, 40), String(mensagem).slice(0, 4000));
  });

  ipcMain.handle('log:ler', () => {
    if (!arquivo || !existsSync(arquivo)) return '';
    try {
      // Só o fim interessa: o começo é de sessões antigas.
      const linhas = readFileSync(arquivo, 'utf8').split(/\r?\n/);
      return linhas.slice(-400).join('\n');
    } catch (e) { return `não consegui ler o registro: ${(e as Error).message}`; }
  });

  ipcMain.handle('log:copiar', (_e, texto: string) => { clipboard.writeText(String(texto ?? '')); });

  ipcMain.handle('log:abrirPasta', () => { if (arquivo) shell.showItemInFolder(arquivo); });

  return arquivo;
}
