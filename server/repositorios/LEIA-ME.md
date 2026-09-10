# Repositórios: o único lugar do servidor que sabe SQL

Cada arquivo aqui é **uma tabela**, e só ele fala com ela. Quem está de fora — as rotas
em `index.mjs`, as regras em `membros.mjs`, `salas.mjs`, `cargos.mjs` — chama função, não
escreve consulta.

## Por que

O SQL estava espalhado por treze arquivos, inclusive dentro da tabela de rotas. Isso
custava três coisas:

- **A mesma consulta nascia duas vezes**, em lugares diferentes, e as duas divergiam com o
  tempo — foi o que aconteceu com o cartão de perfil no app, pela mesma razão.
- **Regra e banco no mesmo parágrafo**: para entender "quem pode dar cargo a quem" era
  preciso ler `UPDATE` junto.
- **Trocar para um ORM seria reescrever o servidor inteiro.** Com tudo aqui dentro, virou
  reescrever esta pasta — e quem chama não fica sabendo.

## A regra, que é conferida por teste

`arquitetura.test.mjs` falha se aparecer `prepare(` fora daqui. As duas exceções estão
escritas lá e são só estas: `banco.mjs`, que é dono do esquema e das migrações, e os
próprios testes, que montam cenário.

## Formato

- Uma função por pergunta ou por mudança, com nome do domínio: `buscarPorApelido`,
  `marcarBanido`. Nunca `query(sql)`.
- `db` entra como primeiro parâmetro — nada de conexão global escondida aqui dentro.
- Devolve a linha crua do banco. Quem traduz para o que o app vê é a camada de cima
  (`verMembro`, `verServidor`), porque isso é decisão de apresentação, não de tabela.
- Sem regra de negócio: repositório não pergunta "pode?". Quem pergunta é `permissoes.mjs`.
