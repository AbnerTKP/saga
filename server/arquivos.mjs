// Guarda as imagens de perfil, banner e do servidor.
//
// O nome do arquivo é o hash do conteúdo, o que dá três coisas de graça: duas pessoas
// que subirem a mesma imagem ocupam um arquivo só, o navegador pode guardar em cache
// para sempre (o nome muda quando a imagem muda), e ninguém escolhe o nome do arquivo —
// o que elimina de saída qualquer travessia de diretório.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Onde as imagens moram: ao lado do banco, sempre.
 *
 * Vem daqui, e não de uma variável própria, porque uma variável própria já foi esquecida:
 * em produção o banco foi apontado para o volume e as fotos ficaram dentro do contêiner,
 * morrendo a cada `up --build` com o banco intacto apontando para elas. Amarradas ao
 * banco, não dá para persistir um e perder o outro.
 */
export const pastaDosArquivos = (banco) => join(dirname(banco), 'arquivos');

export const LIMITES = {
  foto: 3 * 1024 * 1024,     // 3 MB — cabe GIF curto de avatar
  banner: 8 * 1024 * 1024,   // 8 MB — banner é maior, e GIF pesa
  som: 2 * 1024 * 1024,      // 2 MB — soundboard é efeito curto, não música
  chat: 5 * 1024 * 1024,     // 5 MB — GIF de chat é maior que avatar e menor que banner
};

// Assinaturas de verdade, lidas do começo do arquivo. O content-type que o app manda é
// um palpite de quem envia: quem quiser subir um executável dizendo que é PNG consegue.
const ASSINATURAS = [
  { ext: 'png',  bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: 'jpg',  bytes: [0xff, 0xd8, 0xff] },
  { ext: 'gif',  bytes: [0x47, 0x49, 0x46, 0x38] },                        // GIF8
];

export function tipoDaImagem(buf) {
  if (!buf || buf.length < 12) return null;
  for (const { ext, bytes } of ASSINATURAS) {
    if (bytes.every((b, i) => buf[i] === b)) return ext;
  }
  // WEBP é "RIFF" + 4 bytes de tamanho + "WEBP"
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'webp';
  }
  return null;
}

// Áudio do soundboard. Mesma ideia das imagens: o que vale é a assinatura, não o que
// quem envia declara.
const ASSINATURAS_DE_AUDIO = [
  { ext: 'mp3', bytes: [0x49, 0x44, 0x33] },              // "ID3"
  { ext: 'ogg', bytes: [0x4f, 0x67, 0x67, 0x53] },        // "OggS"
  { ext: 'flac', bytes: [0x66, 0x4c, 0x61, 0x43] },       // "fLaC"
];

export function tipoDoAudio(buf) {
  if (!buf || buf.length < 12) return null;
  for (const { ext, bytes } of ASSINATURAS_DE_AUDIO) {
    if (bytes.every((b, i) => buf[i] === b)) return ext;
  }
  // MP3 sem tag ID3 começa direto no quadro: 11 bits ligados.
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  // WAV é "RIFF" + tamanho + "WAVE"; M4A/MP4 tem "ftyp" no offset 4.
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE') return 'wav';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'm4a';
  return null;
}

export class ErroDeArquivo extends Error {
  constructor(mensagem, status = 400) { super(mensagem); this.status = status; }
}

/**
 * Confere e grava. Devolve o nome do arquivo, que é o que vai para o banco.
 * @param {Buffer} buf conteúdo cru enviado
 * @param {'foto'|'banner'} papel define o limite de tamanho
 */
export function salvarImagem(pasta, buf, papel) {
  return guardar(pasta, buf, LIMITES[papel] ?? LIMITES.foto, tipoDaImagem,
    'Nenhuma imagem foi enviada.', 'Só aceito PNG, JPG, GIF ou WEBP.', 'A imagem');
}

/** Mesmo caminho da imagem, para os sons do soundboard. */
export function salvarSom(pasta, buf) {
  return guardar(pasta, buf, LIMITES.som, tipoDoAudio,
    'Nenhum som foi enviado.', 'Só aceito MP3, WAV, OGG, M4A ou FLAC.', 'O som');
}

function guardar(pasta, buf, limite, reconhecer, semNada, tipoRuim, oQue) {
  if (!buf?.length) throw new ErroDeArquivo(semNada);
  if (buf.length > limite) {
    throw new ErroDeArquivo(`${oQue} passa de ${Math.round(limite / 1024 / 1024)} MB.`, 413);
  }
  const ext = reconhecer(buf);
  if (!ext) throw new ErroDeArquivo(tipoRuim);

  const nome = `${createHash('sha256').update(buf).digest('hex').slice(0, 32)}.${ext}`;
  mkdirSync(pasta, { recursive: true });
  const destino = join(pasta, nome);
  if (!existsSync(destino)) writeFileSync(destino, buf);   // já existe = mesma imagem
  return nome;
}

const TIPOS = {
  png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
};

/** Só nomes que nós mesmos geramos passam: 32 hex, ponto, extensão conhecida. */
export function nomeValido(nome) {
  const m = /^([0-9a-f]{32})\.([a-z0-9]{3,4})$/.exec(String(nome ?? ''));
  return m && TIPOS[m[2]] ? { nome, tipo: TIPOS[m[2]] } : null;
}
