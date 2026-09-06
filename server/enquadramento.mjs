// Como a foto e o banner ficam posicionados no espaço em que aparecem.
//
// O app NÃO recorta a imagem: guardar um recorte significaria redesenhá-la, e um GIF
// redesenhado perde a animação — esvaziaria justamente o que o Berserk destrava.
// Em vez disso guardamos onde a imagem foi arrastada e o quanto foi aproximada, e isso é
// aplicado na hora de mostrar. O arquivo enviado nunca é tocado.
//
// x e y são a porcentagem da imagem que fica no centro do quadro; zoom é a aproximação.
// Estas mesmas contas existem em `app/src/renderer/src/enquadramento.ts`: aqui valem
// porque o que vem do app nunca é palavra final, lá porque a tela precisa desenhar.

export const PADRAO = { x: 50, y: 50, zoom: 1 };

export const ZOOM_MAXIMO = 4;

const entre = (n, minimo, maximo) => Math.min(maximo, Math.max(minimo, n));

/** Um enquadramento confiável, ou null quando não há nada de aproveitável. */
export function limpar(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  // `Number(null)` é 0, e 0 é um valor legítimo aqui: sem esta guarda, "não informado"
  // viraria "encostado na borda de cima".
  const numero = (v, padrao) => {
    if (v === null || v === undefined || v === '') return padrao;
    const n = Number(v);
    return Number.isFinite(n) ? n : padrao;
  };
  const limpo = {
    x: entre(numero(valor.x, PADRAO.x), 0, 100),
    y: entre(numero(valor.y, PADRAO.y), 0, 100),
    zoom: entre(numero(valor.zoom, PADRAO.zoom), 1, ZOOM_MAXIMO),
  };
  // Enquadramento igual ao padrão não vale linha no banco: é a ausência de enquadramento.
  return ehPadrao(limpo) ? null : limpo;
}

export const ehPadrao = (e) => e.x === PADRAO.x && e.y === PADRAO.y && e.zoom === PADRAO.zoom;

/**
 * Lê o que está guardado — `{"foto":{...},"banner":{...}}`. Só devolve o que presta, e
 * nunca lança: isto vem do banco, e um registro estragado não pode derrubar o servidor.
 */
export function ler(texto) {
  let cru;
  try {
    cru = JSON.parse(texto ?? '');
  } catch {
    return {};
  }
  if (!cru || typeof cru !== 'object' || Array.isArray(cru)) return {};
  const fora = {};
  for (const papel of ['foto', 'banner']) {
    const limpo = limpar(cru[papel]);
    if (limpo) fora[papel] = limpo;
  }
  return fora;
}

/** Guarda o enquadramento de um papel sem mexer no do outro. Devolve texto, ou null. */
export function guardar(textoAtual, papel, valor) {
  const atual = ler(textoAtual);
  const limpo = limpar(valor);
  if (limpo) atual[papel] = limpo;
  else delete atual[papel];
  return Object.keys(atual).length ? JSON.stringify(atual) : null;
}
