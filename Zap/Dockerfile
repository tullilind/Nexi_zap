FROM node:18-alpine

# O código REAL está dentro da pasta Zap
WORKDIR /app/Zap

# Copia tudo para dentro de /app
COPY . /app

# Agora o package.json EXISTE neste diretório
RUN npm install --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apis.js"]
