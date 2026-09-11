/**
 * Quem pode apagar uma mensagem — espelho da regra do servidor (`podeApagarMensagem`, em
 * permissoes.mjs), só para o botão não aparecer onde seria recusado. Quem decide é o servidor.
 *
 * A própria, sempre: é desfazer um engano, não moderar ninguém. A dos outros, com a
 * permissão do cargo e só de quem está abaixo — e o cargo do autor é o do vínculo DESTE
 * servidor, que é de onde a mensagem é. As notas da versão, ninguém: são da Saga, e o
 * servidor as publicaria de novo.
 */
import type { Cargo } from './api';

type Quem = { id: number; cargo: Cargo | null };

export function podeApagarMensagem(
  eu: Quem,
  autor: Quem | null,
  { minha, daSaga }: { minha: boolean; daSaga: boolean },
): boolean {
  if (daSaga) return false;
  if (minha) return true;
  const cargo = eu.cargo;
  if (!cargo || !(cargo.dono || cargo.permissoes.includes('apagarMensagens'))) return false;
  // Quem saiu do servidor não tem cargo aqui: fica ao alcance de quem pode apagar.
  return (autor?.cargo?.nivel ?? 0) < cargo.nivel;
}
