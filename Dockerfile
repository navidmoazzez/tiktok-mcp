# Self-hosting the HTTP transport. For stdio, use npx and skip this entirely.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY README.md SKILL.md LICENSE ./

# Runs unprivileged: this process holds a credential that can publish.
USER node

# 0.0.0.0 inside the container is fine; the container's port mapping is the
# boundary. The server still refuses a non-loopback bind unless
# TIKTOK_HTTP_TOKEN is set, so set it when you expose this.
ENV TIKTOK_HTTP_HOST=0.0.0.0
ENV TIKTOK_HTTP_PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://127.0.0.1:8000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "dist/index.js", "--http"]
