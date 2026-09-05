// Assina o app em ad-hoc logo depois de empacotar.
//
// Por que isso é necessário: o app não tem certificado da Apple (identity: null), e sem
// nenhuma assinatura o macOS não consegue guardar as permissões de microfone, câmera e
// gravação de tela — ele não tem uma identidade de código para associá-las, então pede
// tudo de novo a cada abertura e a permissão de tela concedida nos Ajustes nunca "cola".
// A assinatura ad-hoc não custa nada, não vem da Apple e não tira o aviso do Gatekeeper;
// ela só dá ao app um CDHash estável, que é o que o TCC usa como chave.
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
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  console.log(`  • assinado em ad-hoc  ${appPath}`);
};
