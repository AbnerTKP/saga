// Guarda as imagens de perfil, banner e do servidor.
//
// O nome do arquivo é o hash do conteúdo, o que dá três coisas de graça: duas pessoas
// que subirem a mesma imagem ocupam um arquivo só, o navegador pode guardar em cache
// para sempre (o nome muda quando a imagem muda), e ninguém escolhe o nome do arquivo —
// o que elimina de saída qualquer travessia de diretório.
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, createWriteStream, renameSync, rmSync } from 'node:fs';
import { once } from 'node:events';
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
  // Arquivo qualquer no chat. Só é grande assim porque ele vai para o disco EM FLUXO:
  // juntar na memória, como os outros fazem, estouraria o teto de 512 MB do contêiner —
  // e foi falta de memória que já derrubou a máquina inteira uma vez.
  arquivo: 200 * 1024 * 1024,
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

/**
 * Um arquivo qualquer, guardado INERTE.
 *
 * Aqui não se reconhece tipo nenhum de propósito: é para mandar o que quiser. O que
 * protege é o arquivo ir para o disco como `.bin` e ser servido como
 * `application/octet-stream` — o nome que a pessoa escolheu fica na MENSAGEM, não no
 * disco. Assim ninguém consegue subir um `.html` e fazer o servidor servi-lo como página,
 * nem um `.svg` que o navegador renderize com script dentro.
 *
 * O nome continua sendo o hash do conteúdo, como todo o resto: cache eterno, dedução de
 * repetidos, e ninguém escolhe o nome — o que elimina escrita fora da pasta.
 */
/**
 * Grava um arquivo grande EM FLUXO, sem nunca tê-lo inteiro na memória.
 *
 * O caminho normal daqui junta os pedaços num Buffer e só então grava — cabe para uma
 * foto de 3 MB, não para um arquivo de 200. Com o contêiner limitado a 512 MB, um envio
 * grande derrubaria o servidor, e falta de memória já derrubou a máquina inteira uma vez.
 *
 * O nome continua sendo o hash do CONTEÚDO, o que obriga a gravar antes de saber o nome:
 * grava-se num temporário, calculando o hash no caminho, e no fim ele é renomeado. Se o
 * conteúdo já existir, o temporário é descartado — é a mesma dedução de repetidos.
 */
export async function salvarArquivoEmFluxo(pasta, fonte, limite = LIMITES.arquivo, oQue = 'O arquivo') {
  mkdirSync(pasta, { recursive: true });
  const temporario = join(pasta, `.parcial-${randomUUID()}`);
  const hash = createHash('sha256');
  let total = 0;

  const saida = createWriteStream(temporario);
  try {
    for await (const pedaco of fonte) {
      total += pedaco.length;
      if (total > limite) {
        throw new ErroDeArquivo(`${oQue} passa de ${Math.round(limite / 1024 / 1024)} MB.`, 413);
      }
      hash.update(pedaco);
      if (!saida.write(pedaco)) await once(saida, 'drain');
    }
    await new Promise((ok, falha) => saida.end((e) => (e ? falha(e) : ok())));
  } catch (e) {
    saida.destroy();
    rmSync(temporario, { force: true });
    throw e;
  }

  if (total === 0) { rmSync(temporario, { force: true }); throw new ErroDeArquivo('Nenhum arquivo foi enviado.'); }

  const nome = `${hash.digest('hex').slice(0, 32)}.bin`;
  const destino = join(pasta, nome);
  if (existsSync(destino)) rmSync(temporario, { force: true });   // mesmo conteúdo, já temos
  else renameSync(temporario, destino);
  return { nome, bytes: total };
}

export function salvarArquivo(pasta, buf) {
  if (!buf?.length) throw new ErroDeArquivo('Nenhum arquivo foi enviado.');
  if (buf.length > LIMITES.arquivo) {
    throw new ErroDeArquivo(`O arquivo passa de ${Math.round(LIMITES.arquivo / 1024 / 1024)} MB.`, 413);
  }
  const nome = `${createHash('sha256').update(buf).digest('hex').slice(0, 32)}.bin`;
  mkdirSync(pasta, { recursive: true });
  const destino = join(pasta, nome);
  if (!existsSync(destino)) writeFileSync(destino, buf);
  return nome;
}

/** O nome que a pessoa escolheu, limpo do que poderia virar caminho ou linha nova. */
export function nomeDeArquivoLimpo(nome) {
  const cru = String(nome ?? '').replace(/[\\/]/g, '_').replace(/[\x00-\x1f]/g, '').trim();
  return cru.slice(0, 120) || 'arquivo';
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
  // Arquivo qualquer. `octet-stream` é o ponto: o navegador não renderiza nem executa —
  // baixa. É por isso que o que vai para o disco perde a extensão original.
  bin: 'application/octet-stream',
};

/** Só nomes que nós mesmos geramos passam: 32 hex, ponto, extensão conhecida. */
export function nomeValido(nome) {
  const m = /^([0-9a-f]{32})\.([a-z0-9]{3,4})$/.exec(String(nome ?? ''));
  return m && TIPOS[m[2]] ? { nome, tipo: TIPOS[m[2]] } : null;
}
