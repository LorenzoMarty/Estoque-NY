FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY index.html ./
COPY css ./css
COPY js ./js
COPY scripts ./scripts
COPY vendor ./vendor

ENV HOST=0.0.0.0 \
    PORT=8080

EXPOSE 8080

CMD ["npm", "run", "dev"]
