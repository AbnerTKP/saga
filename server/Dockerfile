FROM node:22-alpine
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev
# Copia todos os módulos e descarta os testes. Listar arquivo por arquivo já derrubou o
# servidor duas vezes: quem cria um módulo novo esquece de acrescentar aqui.
COPY *.mjs ./
RUN rm -f *.test.mjs
CMD ["node", "index.mjs"]
