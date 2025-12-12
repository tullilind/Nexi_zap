FROM node:18-alpine

WORKDIR /app

# Copia TUDO que veio no contexto
COPY . .

# Instala dependências (package.json já está no contexto)
RUN npm install --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apis.js"]
