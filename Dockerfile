FROM node:22-alpine AS builder

RUN corepack enable

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY src/ src/
COPY tsconfig.json ./

RUN pnpm build

FROM node:22-alpine

RUN corepack enable

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist dist
COPY migrations/ migrations/
COPY config.example.toml config.example.toml

RUN addgroup -S gateway && adduser -S gateway -G gateway \
    && mkdir -p /app/data \
    && chown -R gateway:gateway /app/data

USER gateway

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["pnpm", "start"]
