FROM node:18-alpine

WORKDIR /app

# copia os arquivos de dependência (eles ESTÃO em Zap/)
COPY package.json package-lock.json* ./

RUN npm install --omit=dev

# copia todo o código de Zap/ para /app
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apis.js"]
