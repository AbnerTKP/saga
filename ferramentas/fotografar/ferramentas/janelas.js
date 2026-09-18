// Lista as janelas que os PIDs dados têm no servidor de janelas do macOS, e se estão NA TELA.
// Uso: osascript -l JavaScript janelas.js $(pgrep -f chrome-perfil)
// Serve para provar que o Chrome headless não pôs nada na tela do dono ("naTela" ausente = fora da tela).
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
function run(argv) {
  const pids = argv.map(Number);
  const lista = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, 0)));
  const minhas = lista.filter((w) => pids.includes(w.kCGWindowOwnerPID));
  return JSON.stringify({ total: minhas.length, naTela: minhas.filter((w) => w.kCGWindowIsOnscreen).length,
    janelas: minhas.map((w) => ({ pid: w.kCGWindowOwnerPID, nome: w.kCGWindowName, naTela: !!w.kCGWindowIsOnscreen, b: w.kCGWindowBounds })) });
}
