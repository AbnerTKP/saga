/**
 * A versão da luta que este app fala — o `PROTOCOLO` de `server/lutas.mjs`, e o teste de lá
 * confere os dois. As duas telas rodam a mesma simulação: um app velho, com outra ficha de golpe,
 * veria outra luta e outro vencedor. Por isso app velho não senta: o servidor recusa e manda
 * atualizar. Muda quando a simulação deixar de dar o mesmo resultado que a anterior.
 */
export const PROTOCOLO_DA_LUTA = 5; // 5: lutadores menores (escala 1)
