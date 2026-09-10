/**
 * Onde a conversa vira outro dia.
 *
 * Sem isso o chat é uma coluna contínua e a hora sozinha mente: "22:08" pode ser de hoje
 * ou de três semanas atrás, e as duas ficam coladas. O separador é o que devolve o
 * "quando" a uma lista que só mostra o "que horas".
 *
 * A conta é do fuso de QUEM LÊ, e não de São Paulo como nas notas de versão: nota de
 * versão é um fato com data própria, mensagem é uma coisa que aconteceu no seu dia.
 */

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
               'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** O dia civil, para comparar sem esbarrar em hora, minuto e horário de verão. */
const diaDe = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Precisa de separador antes desta mensagem? A primeira sempre tem. */
export const mudouDeDia = (anterior: number | null, atual: number): boolean =>
  anterior === null || diaDe(anterior) !== diaDe(atual);

/**
 * "Hoje", "Ontem", ou a data por extenso.
 *
 * `agora` entra por parâmetro em vez de sair de `Date.now()` porque assim a regra é
 * testável — e porque uma janela aberta desde ontem precisa que "hoje" seja recalculado,
 * não congelado no momento em que o componente montou.
 */
export function rotuloDoDia(quando: number, agora: number): string {
  const hoje = diaDe(agora);
  if (diaDe(quando) === hoje) return 'Hoje';
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (diaDe(quando) === diaDe(ontem.getTime())) return 'Ontem';

  const d = new Date(quando);
  const mesmoAno = d.getFullYear() === new Date(agora).getFullYear();
  return `${d.getDate()} de ${MESES[d.getMonth()]}${mesmoAno ? '' : ` de ${d.getFullYear()}`}`;
}
