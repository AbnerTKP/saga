// O que se pode fazer num servidor. Lógica pura, sem banco e sem rede: é aqui que um
// descuido vira "membro comum consegue banir o dono", então tudo passa por testes.

/**
 * Cada permissão é uma coisa que se faz, não um nível. Foi o que os três níveis fixos
 * não davam: quem quisesse alguém que só apaga mensagem tinha de torná-lo moderador
 * inteiro, com poder de banir junto.
 */
export const PERMISSOES = {
  mutar: 'Mutar o microfone de alguém',
  desconectar: 'Tirar alguém da call',
  timeout: 'Dar castigo',
  expulsar: 'Expulsar (a pessoa pode voltar)',
  banir: 'Banir para sempre',
  definirCargo: 'Dar e tirar cargos',
  gerirCargos: 'Criar e editar cargos',
  gerirSalas: 'Criar, renomear e apagar salas',
  gerirSons: 'Subir e apagar sons do soundboard',
  gerirServidor: 'Mudar nome e imagens do servidor',
  concederTurbo: 'Dar e tirar o Vorcaro Turbo',
  definirId: 'Definir o identificador de alguém',
};

export const TODAS = Object.keys(PERMISSOES);

/** Ações que recaem sobre outra pessoa. Só estas passam pela regra de hierarquia. */
export const SOBRE_ALGUEM = ['mutar', 'desconectar', 'timeout', 'expulsar', 'banir', 'definirCargo'];

export const ehPermissaoConhecida = (p) => TODAS.includes(p);

/** Descarta o que não existe: permissão inventada não pode virar poder por descuido. */
export const limparPermissoes = (lista) => {
  const vistas = new Set();
  for (const p of Array.isArray(lista) ? lista : []) {
    if (ehPermissaoConhecida(p)) vistas.add(p);
  }
  return [...vistas];
};

/**
 * O dono é dono: tem tudo, sempre, mesmo que alguém edite o cargo dele no banco. Sem
 * isto, um servidor poderia ficar sem ninguém capaz de consertá-lo.
 */
export const temPermissao = (cargo, permissao) =>
  !!cargo && (!!cargo.dono || (cargo.permissoes ?? []).includes(permissao));

/**
 * Diz se `quem` pode fazer `acao` em `alvo`.
 * Recebe { cargo: { nivel, dono, permissoes }, id } de cada lado.
 */
export function podeAgir(quem, acao, alvo) {
  if (!ehPermissaoConhecida(acao)) return { pode: false, motivo: 'ação desconhecida' };
  if (!quem || !alvo) return { pode: false, motivo: 'usuário não encontrado' };
  if (!temPermissao(quem.cargo, acao)) return { pode: false, motivo: 'seu cargo não permite isso' };

  if (SOBRE_ALGUEM.includes(acao)) {
    if (quem.id === alvo.id) return { pode: false, motivo: 'não dá para fazer isso consigo mesmo' };
    // A regra que sustenta tudo: ninguém alcança um igual nem um superior. Sem ela,
    // dois moderadores se derrubariam, e o dono ficaria ao alcance de quem ele promoveu.
    if ((alvo.cargo?.nivel ?? 0) >= (quem.cargo?.nivel ?? 0)) {
      return { pode: false, motivo: 'essa pessoa está no mesmo nível ou acima do seu' };
    }
  }
  return { pode: true };
}

/** Cargo que se atribui precisa estar abaixo do seu: promover ao próprio nível é abdicar. */
export function podeDarCargo(quem, alvo, cargoNovo) {
  const base = podeAgir(quem, 'definirCargo', alvo);
  if (!base.pode) return base;
  if (!cargoNovo) return { pode: false, motivo: 'cargo inválido' };
  if (cargoNovo.dono) return { pode: false, motivo: 'não dá para passar o cargo de dono assim' };
  if (cargoNovo.nivel >= (quem.cargo?.nivel ?? 0)) {
    return { pode: false, motivo: 'não dá para dar um cargo do seu nível ou acima' };
  }
  return { pode: true };
}

/** Editar ou apagar um cargo exige estar acima dele — e o do dono não se toca. */
export function podeMexerNoCargo(quem, cargo) {
  if (!temPermissao(quem?.cargo, 'gerirCargos')) return { pode: false, motivo: 'seu cargo não permite isso' };
  if (!cargo) return { pode: false, motivo: 'cargo não encontrado' };
  if (cargo.dono) return { pode: false, motivo: 'o cargo de dono não pode ser mexido' };
  if (cargo.nivel >= (quem.cargo?.nivel ?? 0) && !quem.cargo?.dono) {
    return { pode: false, motivo: 'esse cargo está no seu nível ou acima' };
  }
  return { pode: true };
}
