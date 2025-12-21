FROM node:25-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY src ./src
COPY package*.json ./
COPY .npmrc .npmrc

RUN npm install --omit=dev

CMD ["npm", "start"]
