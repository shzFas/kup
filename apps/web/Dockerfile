# Build context: repo root  →  docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @kup/web...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:8180
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @kup/web build

FROM node:24-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3180 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
# Standalone output mirrors the monorepo layout (outputFileTracingRoot = repo root).
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3180
CMD ["node", "apps/web/server.js"]
