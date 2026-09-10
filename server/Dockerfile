FROM node:22-alpine
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev
# Copia todos os módulos e descarta os testes. Listar arquivo por arquivo já derrubou o
# servidor duas vezes: quem cria um módulo novo esquece de acrescentar aqui.
#
# `*.mjs` não pega SUBPASTA, e foi assim que o servidor caiu uma terceira vez: a pasta
# `repositorios/` nasceu, os testes passaram aqui, e lá dentro o contêiner subiu sem ela
# — `ERR_MODULE_NOT_FOUND` em loop. `COPY . ./` com `.dockerignore` inverte o problema:
# o padrão passa a ser levar tudo, e o que fica de fora está escrito num lugar só.
COPY . ./
RUN rm -f *.test.mjs
CMD ["node", "index.mjs"]
