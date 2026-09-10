# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @subferry/shared --filter @subferry/core --filter @subferry/server --filter @subferry/web build \
 && pnpm --filter @subferry/server deploy --prod /out

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
COPY --from=build /out ./
COPY --from=build /app/apps/web/dist ./public
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
