# Media processor image (docs/blueprint/19 §5). Build from the repository root:
#   docker build -f services/media-processor/Dockerfile -t socialz-media-processor .
FROM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY server/core/jobs/signing.ts server/core/jobs/signing.ts
COPY server/core/media/ffmpeg-args.ts server/core/media/ffmpeg-args.ts
COPY services/media-processor services/media-processor
RUN npx esbuild services/media-processor/server.ts --bundle --platform=node --format=esm --target=node24 --outfile=dist/media-processor.mjs

FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/dist/media-processor.mjs ./media-processor.mjs
USER node
ENV PORT=3200 NODE_ENV=production
EXPOSE 3200
CMD ["node", "media-processor.mjs"]
