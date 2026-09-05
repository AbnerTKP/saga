FROM node:22-alpine
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev
COPY index.mjs ./
CMD ["node", "index.mjs"]
