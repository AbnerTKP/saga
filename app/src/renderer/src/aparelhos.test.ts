import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comEscolha, decidirMicrofone, escolhasGuardadas, idParaTrocar, opcoesDoSeletor, trocarAparelho, valorNoSeletor } from './aparelhos.ts';

const mic = (deviceId: string, groupId: string, label = deviceId) => ({ deviceId, groupId, label });

test('o padrão do sistema nunca vira id exato vazio', () => {
  // exato e vazio não é aparelho nenhum: o microfone morria ao escolher "Padrão do sistema"
  assert.deepEqual(idParaTrocar('audioinput', ''), { id: 'default', exato: true });
  assert.deepEqual(idParaTrocar('audiooutput', ''), { id: 'default', exato: true });
  assert.deepEqual(idParaTrocar('videoinput', ''), { id: '', exato: false });
  assert.deepEqual(idParaTrocar('audioinput', 'abc'), { id: 'abc', exato: true });
});

test('o seletor mostra o padrão como vazio, venha ele como default ou como nada', () => {
  assert.equal(valorNoSeletor('default'), '');
  assert.equal(valorNoSeletor(undefined), '');
  assert.equal(valorNoSeletor('communications'), '');
  assert.equal(valorNoSeletor('abc'), 'abc');
});

test('a lista tira os apelidos e diz qual aparelho é o padrão', () => {
  const { lista, nomeDoPadrao } = opcoesDoSeletor([
    mic('default', 'g1', 'Padrão - Microfone do MacBook Pro'),
    mic('communications', 'g1', 'Comunicações - Microfone do MacBook Pro'),
    mic('a', 'g1', 'Microfone do MacBook Pro'),
    mic('b', 'g2', 'HyperX'),
  ]);
  assert.deepEqual(lista.map((a) => a.deviceId), ['a', 'b']);
  assert.equal(nomeDoPadrao, 'Microfone do MacBook Pro');
  assert.equal(opcoesDoSeletor([mic('default', 'g', 'Default - USB Mic')]).nomeDoPadrao, 'USB Mic');
  assert.equal(opcoesDoSeletor([mic('a', 'g')]).nomeDoPadrao, null);
});

test('a escolha guardada é só de aparelho de verdade, e o padrão apaga a escolha', () => {
  assert.deepEqual(escolhasGuardadas(null), {});
  assert.deepEqual(escolhasGuardadas('lixo'), {});
  assert.deepEqual(escolhasGuardadas('{"audioinput":"default","videoinput":3,"audiooutput":"x","outro":"y"}'), { audiooutput: 'x' });
  const escolhido = comEscolha(null, 'audioinput', 'b');
  assert.deepEqual(escolhasGuardadas(escolhido), { audioinput: 'b' });
  assert.deepEqual(escolhasGuardadas(comEscolha(escolhido, 'audioinput', '')), {});
});

test('o microfone escolhido na Saga volta a valer quando está conectado', () => {
  const disponiveis = [mic('default', 'g1'), mic('a', 'g1'), mic('b', 'g2')];
  assert.deepEqual(decidirMicrofone({ escolhido: 'b', ativo: 'default', disponiveis, grupoDaFaixa: 'g1' }), { trocarPara: 'b' });
  assert.equal(decidirMicrofone({ escolhido: 'b', ativo: 'b', disponiveis, grupoDaFaixa: 'g2' }), null);
  // desconectado, quem cai para o padrão é o LiveKit: aqui não se decide nada
  assert.equal(decidirMicrofone({ escolhido: 'c', ativo: 'c', disponiveis, grupoDaFaixa: 'g3' }), null);
});

test('no padrão do sistema, o microfone reabre quando o sistema troca de aparelho', () => {
  const antes = [mic('default', 'g1'), mic('a', 'g1'), mic('b', 'g2')];
  assert.equal(decidirMicrofone({ escolhido: undefined, ativo: 'default', disponiveis: antes, grupoDaFaixa: 'g1' }), null);
  const depois = [mic('default', 'g2'), mic('a', 'g1'), mic('b', 'g2')];
  assert.deepEqual(decidirMicrofone({ escolhido: undefined, ativo: 'default', disponiveis: depois, grupoDaFaixa: 'g1' }), { reabrirNoPadrao: true });
  // sem faixa aberta, não há o que reabrir; e quem escolheu um aparelho não segue o sistema
  assert.equal(decidirMicrofone({ escolhido: undefined, ativo: 'default', disponiveis: depois, grupoDaFaixa: null }), null);
  assert.equal(decidirMicrofone({ escolhido: undefined, ativo: 'a', disponiveis: depois, grupoDaFaixa: 'g1' }), null);
});

test('a troca que falha volta ao padrão, em vez de deixar o microfone fechado', async () => {
  const pedidos: [string, string, boolean | undefined][] = [];
  const room = {
    switchActiveDevice: async (tipo: MediaDeviceKind, id: string, exato?: boolean) => {
      pedidos.push([tipo, id, exato]);
      if (id === 'ocupado') throw new Error('Could not start audio source');
      return true;
    },
  };
  await assert.rejects(trocarAparelho(room, 'audioinput', 'ocupado'), /Could not start/);
  assert.deepEqual(pedidos, [['audioinput', 'ocupado', true], ['audioinput', 'default', true]]);
  pedidos.length = 0;
  await trocarAparelho(room, 'audioinput', 'bom');
  assert.deepEqual(pedidos, [['audioinput', 'bom', true]]);
  // a saída de som não fecha nada ao trocar: falhar não mexe em mais nada
  pedidos.length = 0;
  await assert.rejects(trocarAparelho(room, 'audiooutput', 'ocupado'));
  assert.deepEqual(pedidos, [['audiooutput', 'ocupado', true]]);
});
