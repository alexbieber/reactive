# Wizard UI + API (ZIP codegen) on one port. Build context = repo root (respect .dockerignore).
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci && npm run build -w web
ENV NODE_ENV=production
ENV SERVE_STATIC=1
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/api/src/server.mjs"]
