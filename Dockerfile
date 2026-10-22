FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --include=dev --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server
COPY shared ./shared
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production HOST=:: PORT=3000 ROOMS_STATE_FILE=/app/.local/rooms-state.json
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /app/.local && chown node:node /app/.local
USER node
EXPOSE 3000
VOLUME ["/app/.local"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/index.ts", "--production"]
