// Assina o app logo depois de empacotar.
//
// Por que assinar: sem nenhuma assinatura o macOS não tem identidade de código para
// associar às permissões de microfone, câmera e gravação de tela, e pede tudo de novo a
// cada abertura.
//
// Por que ad-hoc NÃO basta, e este comentário já disse o contrário: a assinatura ad-hoc
// não dá "um CDHash estável" — o CDHash é justamente o que muda a cada build. O que o
// macOS guarda junto da permissão é o requisito designado, e no ad-hoc ele é o próprio
// CDHash. Medido nesta máquina, com o app real:
//
//   ad-hoc        → designated => cdhash H"a644c9ee…"      (muda a cada build)
//   certificado   → designated => identifier "br.com.vorcaro.cantinho"
//                                 and certificate root = H"…"   (idêntico entre builds)
//
// Três builds com conteúdo diferente assinados com o mesmo certificado deram CDHash
// diferente e requisito byte a byte igual; em ad-hoc, o build seguinte não satisfaz o
// requisito do anterior (`codesign --verify -R` sai 3). É por isso que cada versão nova
// vira "outro app" e a chave ligada nos Ajustes deixa de valer.
//
// Daí MAC_SIGN_IDENTITY: com a variável, assina com o certificado (o CI a define a partir
// de um .p12 guardado em secret, sempre o mesmo); sem ela, cai no ad-hoc de antes, para o
// build local de quem não tem o certificado à mão continuar funcionando.
//
// Roda também no pacote universal já mesclado (o macPackager emite afterPack sobre ele),
// que é justamente o que vai para dentro do DMG.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  // Num build universal o electron-builder empacota x64 e arm64 em pastas "-temp" e depois
  // funde as duas. Assinar antes da fusão quebra o build: a assinatura escreve um
  // _CodeSignature/CodeResources diferente em cada arquitetura, e o @electron/universal
  // exige que todo arquivo não-binário seja idêntico nas duas. Só assinamos o resultado
  // final já fundido, que é o que entra no DMG.
  if (context.appOutDir.endsWith('-temp')) return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const identidade = process.env.MAC_SIGN_IDENTITY || '-';
  const chaveiro = process.env.MAC_SIGN_KEYCHAIN;

  const argumentos = ['--force', '--deep', '--sign', identidade];
  if (chaveiro) argumentos.push('--keychain', chaveiro);
  execFileSync('codesign', [...argumentos, appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });

  // O requisito designado é o que o macOS guarda junto da permissão. Imprimir aqui é o
  // jeito de um build errado (voltou para ad-hoc sem ninguém notar) aparecer no registro
  // do CI em vez de aparecer como "de novo pedindo permissão" na máquina de alguém.
  const requisito = execFileSync('codesign', ['-d', '-r-', appPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  console.log(`  • assinado ${identidade === '-' ? 'em ad-hoc (permissão do Mac cai a cada versão)' : `com "${identidade}"`}  ${appPath}`);
  console.log(`  • ${requisito.trim().split('\n').filter((l) => l.includes('designated')).join(' ')}`);
};
