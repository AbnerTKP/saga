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
  definirId: 'Definir o identificador de alguém',
};

// `concederTurbo` viveu aqui e saiu: o Berserk é da conta, e vale na Saga inteira. Quem
// concede tem de estar no mesmo plano do que concede — senão o dono de um servidor
// qualquer distribuiria distinção que aparece em todos os outros. Hoje é do dono da Saga,
// em `plataforma.mjs`. Cargo antigo que ainda a tenha guardada perde na leitura, pela
// regra de sempre: permissão que não existe é descartada.
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
    // Quem criou o servidor escolhe o próprio cargo. A regra de "não faça em si mesmo"
    // existe para impedir autopromoção, e para ele isso não quer dizer nada: já tem
    // tudo. Sem esta brecha, o dono ficava preso no cargo com que entrou e não conseguia
    // vestir o que o pessoal de lá criou.
    const escolhendoOProprioCargo = acao === 'definirCargo' && quem.id === alvo.id && quem.cargo?.dono;
    if (quem.id === alvo.id && !escolhendoOProprioCargo) {
      return { pode: false, motivo: 'não dá para fazer isso consigo mesmo' };
    }
    // A regra que sustenta tudo: ninguém alcança um igual nem um superior. Sem ela,
    // dois moderadores se derrubariam, e o dono ficaria ao alcance de quem ele promoveu.
    if (quem.id !== alvo.id && (alvo.cargo?.nivel ?? 0) >= (quem.cargo?.nivel ?? 0)) {
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
  // Não há mais cargo de dono para passar; o que sobra é o limite de nível, e ele não
  // vale para quem está escolhendo o PRÓPRIO cargo — ver podeAgir.
  if (quem.id !== alvo.id && cargoNovo.nivel >= (quem.cargo?.nivel ?? 0)) {
    return { pode: false, motivo: 'não dá para dar um cargo do seu nível ou acima' };
  }
  return { pode: true };
}

/** Editar ou apagar um cargo exige estar acima dele. */
export function podeMexerNoCargo(quem, cargo) {
  if (!temPermissao(quem?.cargo, 'gerirCargos')) return { pode: false, motivo: 'seu cargo não permite isso' };
  if (!cargo) return { pode: false, motivo: 'cargo não encontrado' };
  if (cargo.dono) return { pode: false, motivo: 'o cargo de dono não pode ser mexido' };
  if (cargo.nivel >= (quem.cargo?.nivel ?? 0) && !quem.cargo?.dono) {
    return { pode: false, motivo: 'esse cargo está no seu nível ou acima' };
  }
  return { pode: true };
}
