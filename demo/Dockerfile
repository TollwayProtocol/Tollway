FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root
COPY package.json package-lock.json turbo.json tsconfig.base.json ./

# Copy packages needed by demo
COPY packages/tollway-server ./packages/tollway-server

# Copy demo
COPY demo ./demo

# Install deps and build
RUN npm ci --workspace=packages/tollway-server --workspace=demo
RUN npm run build --workspace=packages/tollway-server
RUN cd demo && npm run build

# ─── Runtime image ────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/demo/dist ./dist
COPY --from=builder /app/packages/tollway-server/dist ./node_modules/@tollway/server/dist
COPY --from=builder /app/packages/tollway-server/package.json ./node_modules/@tollway/server/package.json
COPY --from=builder /app/demo/node_modules ./node_modules

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/server.js"]
