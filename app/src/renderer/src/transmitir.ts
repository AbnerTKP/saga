/**
 * Se o crachá da call deixa transmitir a tela.
 *
 * Quem decide é o servidor, pelo cargo (`fontesDaCall`, em permissoes.mjs), e quem trava é
 * o LiveKit. O app só LÊ o que o LiveKit diz — é a mesma informação que já barra a
 * publicação, e ela muda sozinha quando o dono liga ou desliga a permissão com a pessoa
 * dentro da call. Ler do cargo daria um botão aceso que o LiveKit recusaria.
 *
 * Lista vazia (ou ausente) é "sem lista", e sem lista o LiveKit aceita tudo.
 */
export const TELA_NO_LIVEKIT = 3; // TrackSource.SCREEN_SHARE no protocolo

export const podeTransmitir = (fontes?: readonly number[] | null): boolean =>
  !fontes?.length || fontes.includes(TELA_NO_LIVEKIT);

export const MOTIVO_SEM_TRANSMITIR = 'Seu cargo não pode transmitir a tela';
