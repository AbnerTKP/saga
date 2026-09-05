// Guarda as imagens de perfil, banner e do servidor.
//
// O nome do arquivo é o hash do conteúdo, o que dá três coisas de graça: duas pessoas
// que subirem a mesma imagem ocupam um arquivo só, o navegador pode guardar em cache
// para sempre (o nome muda quando a imagem muda), e ninguém escolhe o nome do arquivo —
// o que elimina de saída qualquer travessia de diretório.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const LIMITES = {
  foto: 3 * 1024 * 1024,     // 3 MB — cabe GIF curto de avatar
  banner: 8 * 1024 * 1024,   // 8 MB — banner é maior, e GIF pesa
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

export class ErroDeArquivo extends Error {
  constructor(mensagem, status = 400) { super(mensagem); this.status = status; }
}

/**
 * Confere e grava. Devolve o nome do arquivo, que é o que vai para o banco.
 * @param {Buffer} buf conteúdo cru enviado
 * @param {'foto'|'banner'} papel define o limite de tamanho
 */
export function salvarImagem(pasta, buf, papel) {
  const limite = LIMITES[papel] ?? LIMITES.foto;
  if (!buf?.length) throw new ErroDeArquivo('Nenhuma imagem foi enviada.');
  if (buf.length > limite) {
    throw new ErroDeArquivo(`A imagem passa de ${Math.round(limite / 1024 / 1024)} MB.`, 413);
  }
  const ext = tipoDaImagem(buf);
  if (!ext) throw new ErroDeArquivo('Só aceito PNG, JPG, GIF ou WEBP.');

  const nome = `${createHash('sha256').update(buf).digest('hex').slice(0, 32)}.${ext}`;
  mkdirSync(pasta, { recursive: true });
  const destino = join(pasta, nome);
  if (!existsSync(destino)) writeFileSync(destino, buf);   // já existe = mesma imagem
  return nome;
}

const TIPOS = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** Só nomes que nós mesmos geramos passam: 32 hex, ponto, extensão conhecida. */
export function nomeValido(nome) {
  const m = /^([0-9a-f]{32})\.(png|jpg|gif|webp)$/.exec(String(nome ?? ''));
  return m ? { nome, tipo: TIPOS[m[2]] } : null;
}
