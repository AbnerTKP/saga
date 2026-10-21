import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lerAjustes, paraMandar, iconeDoJogo, capaDoJogo, haQuantoTempo, anotarVisto, lerVistos, AJUSTES_PADRAO, VISTOS_NO_MAXIMO,
  lerIconesSubidos, bytesDoPng,
} from './atividade.ts';
import type { JogoNoComputador } from './desktop';

const VALHEIM: JogoNoComputador = {
  chave: 'steam:892970', nome: 'Valheim', steam: 892970, icone: '2f64c9a826e2c6cf3253fea4834c2e612db09143', origem: 'steam', desde: 1000,
};

test('nasce ligada, e chave vazia ou estragada não desliga ninguém', () => {
  assert.deepEqual(lerAjustes(null), AJUSTES_PADRAO);
  assert.deepEqual(lerAjustes(''), AJUSTES_PADRAO);
  assert.deepEqual(lerAjustes('{quebrado'), AJUSTES_PADRAO);
  assert.deepEqual(lerAjustes('[]'), AJUSTES_PADRAO);
  assert.equal(lerAjustes('{"mostrar":false}').mostrar, false);
  assert.deepEqual(lerAjustes('{"escondidos":["steam:1",2,"steam:1"],"meus":[{"exe":"Jogo.exe","nome":" Jogo "},{"exe":"x.exe","nome":" "}]}'),
    { mostrar: true, escondidos: ['steam:1'], meus: [{ exe: 'jogo.exe', nome: 'Jogo' }] });
});

test('vai para o servidor só o que os outros veem, e nada se estiver desligado ou escondido', () => {
  assert.deepEqual(paraMandar(VALHEIM, AJUSTES_PADRAO), { nome: 'Valheim', desde: 1000, steam: 892970, icone: VALHEIM.icone, imagem: null });
  assert.equal(paraMandar(VALHEIM, { ...AJUSTES_PADRAO, mostrar: false }), null);
  assert.equal(paraMandar(VALHEIM, { ...AJUSTES_PADRAO, escondidos: ['steam:892970'] }), null);
  assert.equal(paraMandar(null, AJUSTES_PADRAO), null);
});

test('a imagem é montada com o número e o hash, e só com eles', () => {
  assert.equal(iconeDoJogo(VALHEIM),
    'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/892970/2f64c9a826e2c6cf3253fea4834c2e612db09143.jpg');
  assert.equal(iconeDoJogo({ steam: 892970, icone: null }), null);
  assert.equal(iconeDoJogo({ steam: 892970, icone: '../../x' }), null);
  assert.equal(iconeDoJogo({ steam: null, icone: VALHEIM.icone }), null);
  assert.equal(capaDoJogo(VALHEIM), 'https://cdn.cloudflare.steamstatic.com/steam/apps/892970/library_600x900.jpg');
  assert.equal(capaDoJogo({ steam: null }), null);
});

test('há quanto tempo, do jeito que se fala', () => {
  const agora = 100 * 3_600_000;
  assert.equal(haQuantoTempo(agora - 20_000, agora), 'agora há pouco');
  assert.equal(haQuantoTempo(agora + 5_000, agora), 'agora há pouco', 'relógio adiantado não vira futuro');
  assert.equal(haQuantoTempo(agora - 5 * 60_000, agora), 'há 5 min');
  assert.equal(haQuantoTempo(agora - 72 * 60_000, agora), 'há 1 h 12 min');
  assert.equal(haQuantoTempo(agora - 3 * 3_600_000, agora), 'há 3 h');
  assert.equal(haQuantoTempo(agora - (12 * 60 + 30) * 60_000, agora), 'há 12 h', 'maratona não precisa dos minutos');
});

test('o jogo aberto vai para o topo dos vistos, sem repetir, e a lista tem teto', () => {
  const um = anotarVisto([], VALHEIM, 5000);
  assert.deepEqual(um, [{ chave: 'steam:892970', nome: 'Valheim', steam: 892970, icone: VALHEIM.icone, origem: 'steam', vistoEm: 5000 }]);
  const outro = { ...VALHEIM, chave: 'exe:x.exe', nome: 'X', steam: null, icone: null, origem: 'conhecido' as const };
  const dois = anotarVisto(anotarVisto(um, outro, 6000), VALHEIM, 7000);
  assert.deepEqual(dois.map((v) => v.chave), ['steam:892970', 'exe:x.exe']);
  let muitos = dois;
  for (let i = 0; i < 30; i++) muitos = anotarVisto(muitos, { ...outro, chave: `exe:${i}.exe` }, i);
  assert.equal(muitos.length, VISTOS_NO_MAXIMO);
  assert.deepEqual(lerVistos(JSON.stringify(dois)), dois);
  assert.deepEqual(lerVistos('{"x":1}'), []);
  assert.deepEqual(lerVistos('[{"chave":1}]'), []);
});

test('jogo de fora do Steam leva o ícone subido; o do Steam continua pelo CDN', () => {
  const lol = { chave: 'exe:league of legends.exe', nome: 'League of Legends', steam: null, icone: null, origem: 'conhecido' as const, desde: 5 };
  const nome = '0123456789abcdef0123456789abcdef.png';
  assert.equal(paraMandar(lol, AJUSTES_PADRAO, nome)?.imagem, nome);
  assert.equal(paraMandar(lol, AJUSTES_PADRAO)?.imagem, null, 'sem ícone subido ainda, vai sem');
  assert.equal(paraMandar(VALHEIM, AJUSTES_PADRAO, nome)?.imagem, null, 'o do Steam não leva o nosso');
});

test('os ícones já subidos guardados neste computador, conferidos', () => {
  const nome = '0123456789abcdef0123456789abcdef.png';
  assert.deepEqual(lerIconesSubidos(JSON.stringify({ 'exe:lol.exe': nome, 'exe:x.exe': 'https://mal/x.png', 'exe:y.exe': 3 })), { 'exe:lol.exe': nome });
  assert.deepEqual(lerIconesSubidos('lixo'), {});
  assert.deepEqual(lerIconesSubidos('[]'), {});
});

test('o PNG do ícone sai do data URL sem fetch, e só PNG', () => {
  // Um PNG de 1×1 de verdade.
  const bytes = bytesDoPng('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
  assert.deepEqual([...bytes!.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(bytesDoPng('data:image/jpeg;base64,AAAA'), null);
  assert.equal(bytesDoPng('https://x/y.png'), null);
});

test('o programa apontado guarda o título da janela', () => {
  assert.deepEqual(lerAjustes('{"meus":[{"exe":"MeuJogo.exe","nome":"Meu Jogo","janela":"MeuJogo v1.2"}]}').meus,
    [{ exe: 'meujogo.exe', nome: 'Meu Jogo', janela: 'MeuJogo v1.2' }]);
});
