/**
 * O que está fechado por escolha, e não por falta de código.
 *
 * Uma constante em vez de apagar a tela: o caminho inteiro continua aqui, testado e
 * pronto, e reabrir é trocar `false` por `true`. Arrancar a funcionalidade e escrevê-la
 * de novo depois é o jeito caro de fazer a mesma coisa.
 */

/**
 * Criar servidor novo. Fechado de propósito — a decisão é de estratégia, não técnica.
 * Entrar com convite continua aberto: é assim que alguém chega num servidor que já existe.
 */
export const PODE_CRIAR_SERVIDOR = false;

/**
 * Vários servidores. Guardado por escolha do dono, com tudo no lugar: os servidores, os
 * cargos e as configurações continuam no banco, e a voz que atravessa servidor continua
 * funcionando por baixo. O que sai é a BARRA de servidores e o caminho de entrar noutro
 * — sem ela não há como trocar, então não há como se perder.
 *
 * As configurações do servidor continuam alcançáveis pelo nome dele, no alto da lista:
 * era o outro caminho, e vira o único.
 */
export const MOSTRAR_SERVIDORES = false;
