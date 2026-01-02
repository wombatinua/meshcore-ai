FROM node:25-alpine

WORKDIR /app

ENV NODE_ENV=production

# toolchain + git for native deps and git-based packages
RUN apk add --no-cache git python3 make g++

# install deps first to leverage Docker layer cache
COPY package*.json ./
COPY .npmrc .npmrc
RUN npm install --omit=dev

# then add source
COPY src ./src

CMD ["npm", "run", "start:docker"]
