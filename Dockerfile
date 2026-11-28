# Ledgerline API. Build from the repository root: docker build -t ledgerline-api .
# Secrets are never baked in: pass them as environment variables when the container runs (see docs/deploy.md).
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev -w @ledgerline/backend

FROM node:24-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY backend/package.json backend/
COPY backend/src backend/src
COPY src/config src/config
COPY database/migrations database/migrations
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.status<500||r.status===503?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/src/server.js"]
