FROM node:22-alpine AS builder

RUN corepack enable
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

COPY apps/gateway/package.json apps/gateway/
COPY apps/admin/package.json apps/admin/

RUN pnpm install --frozen-lockfile

COPY apps/gateway/ apps/gateway/
COPY apps/admin/ apps/admin/
COPY tsconfig.base.json ./

RUN pnpm turbo build --filter=@llm-gateway/admin --filter=@llm-gateway/gateway

FROM node:22-alpine

RUN corepack enable
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY apps/gateway/package.json apps/gateway/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/gateway/dist apps/gateway/dist
COPY --from=builder /app/apps/admin/dist apps/admin/dist
COPY apps/gateway/migrations/ apps/gateway/migrations/
COPY apps/gateway/config.example.toml apps/gateway/config.example.toml

RUN addgroup -S gateway && adduser -S gateway -G gateway \
    && mkdir -p /app/data \
    && chown -R gateway:gateway /app/data

USER gateway

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "apps/gateway/dist/index.js"]
