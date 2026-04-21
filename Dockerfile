FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY server.ts ./
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "--import", "tsx/esm", "server.ts"]
