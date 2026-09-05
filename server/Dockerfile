FROM node:22-alpine
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev
COPY index.mjs participantes.mjs banco.mjs cargos.mjs contas.mjs membros.mjs ./
CMD ["node", "index.mjs"]
