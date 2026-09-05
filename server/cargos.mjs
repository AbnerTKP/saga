// Cargos e o que cada um pode fazer. Lógica pura, sem banco e sem rede, para poder
// ser testada à exaustão: é aqui que um descuido vira "moderador consegue banir o dono".

export const CARGO = {
  MEMBRO: 10,
  MODERADOR: 50,
  DONO: 100,
};

export const NOME_DO_CARGO = {
  [CARGO.MEMBRO]: 'Membro',
  [CARGO.MODERADOR]: 'Moderador',
  [CARGO.DONO]: 'Dono',
};

// Cargo mínimo para cada ação.
export const EXIGE = {
  mutar: CARGO.MODERADOR,        // força o microfone de alguém a desligar
  desconectar: CARGO.MODERADOR,  // tira da call; a pessoa pode voltar
  timeout: CARGO.MODERADOR,      // impede de entrar em sala por um tempo
  expulsar: CARGO.MODERADOR,     // derruba a sessão; precisa entrar de novo
  banir: CARGO.DONO,             // impede de entrar para sempre
  definirCargo: CARGO.DONO,      // promove e rebaixa
};

export const ACOES = Object.keys(EXIGE);

/**
 * Diz se `quem` pode fazer `acao` em `alvo`, ou por que não pode.
 * Recebe apenas { id, cargo } de cada lado — nada de objeto de banco inteiro.
 * @returns {{ pode: true } | { pode: false, motivo: string }}
 */
export function podeAgir(quem, acao, alvo) {
  const minimo = EXIGE[acao];
  if (minimo === undefined) return { pode: false, motivo: 'ação desconhecida' };
  if (!quem || !alvo) return { pode: false, motivo: 'usuário não encontrado' };

  if (quem.id === alvo.id) return { pode: false, motivo: 'não dá para fazer isso consigo mesmo' };
  if (quem.cargo < minimo) {
    return { pode: false, motivo: `precisa ser ${NOME_DO_CARGO[minimo]} ou acima` };
  }
  // Ninguém mexe com igual ou superior. É o que impede um moderador de derrubar
  // outro moderador, e principalmente de encostar no dono.
  if (alvo.cargo >= quem.cargo) {
    return { pode: false, motivo: `${NOME_DO_CARGO[alvo.cargo] ?? 'esse usuário'} está no mesmo nível ou acima do seu` };
  }
  return { pode: true };
}

/** O dono não pode se rebaixar sozinho: o servidor ficaria sem ninguém no topo. */
export function podeDefinirCargo(quem, alvo, novoCargo) {
  if (!Object.values(CARGO).includes(novoCargo)) {
    return { pode: false, motivo: 'cargo inválido' };
  }
  const base = podeAgir(quem, 'definirCargo', alvo);
  if (!base.pode) return base;
  // Nem promover alguém ao seu próprio nível ou acima.
  if (novoCargo >= quem.cargo) {
    return { pode: false, motivo: 'não dá para promover alguém ao seu nível ou acima' };
  }
  return { pode: true };
}
