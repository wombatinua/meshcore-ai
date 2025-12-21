FROM node:25-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

CMD ["npm", "start"]
