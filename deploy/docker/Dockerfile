# Socialz.id app (Nitro preset node-server). Build from the repository root:
#   docker build -f deploy/docker/Dockerfile -t socialz-app .
FROM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json .nvmrc ./
RUN npm ci
COPY . .
# An image build has no database: CI runs `npm run db:deploy` before rolling the image out.
ENV NITRO_PRESET=node-server SKIP_DB_DEPLOY=1
RUN npm run build

FROM node:24-slim
WORKDIR /app
COPY --from=build /src/.output ./.output
# Migrations run from CI (`npm run db:deploy`), never on app start.
COPY --from=build /src/server/core/db/migrations ./migrations
USER node
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
