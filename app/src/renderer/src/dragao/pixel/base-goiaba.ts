/**
 * O Goiaba parado, pixel por pixel, do zip que o dono mandou (Idle/rotations/east.png, 32x32,
 * olhando para a direita). É DADO e não PNG: os testes rodam em node e o app lê igual, sem
 * decodificar imagem nenhuma. As letras são as mesmas que o leitor de grade imprime, uma por cor.
 *
 * O parado0 é exatamente isto. Tudo o mais — as outras poses, a forma dourada, os outros
 * lutadores — sai daqui: recortando cabeça, tronco e pernas, e somando os carimbos desenhados no
 * mesmo acabamento.
 */

export const PALETA_GOIABA: Record<string, string> = {
  a: '#490520', b: '#000000', c: '#471929', d: '#0d021a', e: '#501e2a', f: '#40062c',
  g: '#260d18', h: '#350203', i: '#5b2932', j: '#090514', k: '#29021c', l: '#633a3a',
  m: '#fdecc7', n: '#3c0c21', o: '#f8e5e3', p: '#f49b8a', q: '#fbf3fe', r: '#701c40',
  s: '#fcc9a8', t: '#fbfafe', u: '#460207', v: '#72043a', w: '#f88e84', x: '#fcd187',
  y: '#040205', z: '#1c0004', A: '#900008', B: '#f7a995', C: '#7f0233', D: '#fd7510',
  E: '#fd8311', F: '#ef4c22', G: '#f4cdc7', H: '#050000', I: '#ff6b08', J: '#1a5d80',
  K: '#0d37a6', L: '#186373', M: '#ef2d11', N: '#1261bd', O: '#1c67db', P: '#011169',
  Q: '#282269', R: '#fffcb5', S: '#f58da5', T: '#00000a', U: '#fefce6', V: '#ac0012',
  W: '#c90220', X: '#dc041d', Y: '#2a70e9', Z: '#1946c2', '0': '#225ae4', '1': '#fe9825',
  '2': '#f72211', '3': '#2c72cd', '4': '#3157bc', '5': '#473251', '6': '#204091', '7': '#0627a1',
  '8': '#fdaf45', '9': '#5d001b', '@': '#6f010e', '#': '#1d32bf',
};

export const LINHAS_GOIABA = [
  '................................',
  '.................a..............',
  '...............bcd..............',
  '..............bed.fff...........',
  '..............gcffeh............',
  '.............bicfeej............',
  '............kieiieej............',
  '.......baa.keeiliieeb...........',
  '........jceeiciiiieieb..........',
  '......ffggeeeieiicmeieb.........',
  '.....kaecceecicincoceib.........',
  '.......knncccnnepqrpcb..........',
  '........bcccnssnstusv...........',
  '.......bkcccewxsstyswz..........',
  '.........bgcccwssssssz..........',
  '...........nakAsBsssC...........',
  '............uDEFGbHz............',
  '...........uIJKLMNz.............',
  '...........bJyKOPDQb............',
  '...........bjtRSTIIbb...........',
  '...........bPUmbVWXub...........',
  '............hmYYZOKu............',
  '............hO0URHMu............',
  '............hCtob1Az............',
  '............bE221IXh............',
  '...........h2EEDDXb.............',
  '............b2WX2fb.............',
  '............b345bKVb............',
  '............b678b9@b............',
  '............bu#O2n..............',
  '..............vNV@..............',
  '................................',
];

/**
 * De que material é cada pixel da base (as letras de `materiais.ts`): c cabelo, p pele, o olho,
 * r camisa, m manga, l mão, f faixa, k calça, b bota, s sola. A mesma cor serve a coisas
 * diferentes — o branco do olho é o da mão, o preto contorna tudo —, então é o PIXEL que diz, e
 * não a cor. O contorno pertence ao que ele contorna: é assim que ele troca de cor junto.
 */
export const MATERIAIS_GOIABA = [
  '................................',
  '.................c..............',
  '...............ccc..............',
  '..............ccc.ccc...........',
  '..............cccccc............',
  '.............ccccccc............',
  '............cccccccc............',
  '.......ccc.cccccccccc...........',
  '........cccccccccccccc..........',
  '......ccccccccccccpcccc.........',
  '.....cccccccccccccpcccc.........',
  '.......cccccccccpoopcc..........',
  '........cccccppcpoopp...........',
  '.......ccccccppppooppp..........',
  '.........cccccpppppppp..........',
  '...........cccppppppp...........',
  '............rrrrpppp............',
  '...........rrmmmrmr.............',
  '...........rmmmmmrmr............',
  '...........rmlllrrrrr...........',
  '...........rmlllrrrrr...........',
  '............flffffff............',
  '............fffllfkk............',
  '............kkllkkkk............',
  '............kkkkkkkk............',
  '...........kkkkkkkk.............',
  '............kkkkkkk.............',
  '............bbbbbbsb............',
  '............bbbsbssb............',
  '............bsbbss..............',
  '..............sbss..............',
  '................................',
];
