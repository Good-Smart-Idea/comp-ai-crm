FROM node:22-bookworm

ARG BUN_VERSION=1.3.12
ARG API_URL
ARG APP_URL
ARG REVISION

LABEL org.opencontainers.image.revision=$REVISION

RUN npm install --global "bun@${BUN_VERSION}"

WORKDIR /src
COPY . /src

RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build bun install --frozen-lockfile
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build bun run --filter=@crm/db build
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build bun run --filter=api build
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build API_URL="$API_URL" APP_URL="$APP_URL" node apps/app/node_modules/next/dist/bin/next build apps/app
