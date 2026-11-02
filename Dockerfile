# Nuxt 3 SSR image for Coolify.
# Build pack: Dockerfile. Container port: 3000.
# In Coolify, mark these as available at build time — Nuxt inlines them
# into the client bundle: SUPABASE_URL, SUPABASE_KEY, META_APP_ID,
# META_WHATSAPP_CONFIG_ID. Every other secret stays runtime-only.

FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN npm install -g pnpm@9.5.0

COPY package.json pnpm-lock.yaml .npmrc ./
COPY . .

RUN pnpm install --frozen-lockfile

ARG SUPABASE_URL
ARG SUPABASE_KEY
ARG META_APP_ID
ARG META_WHATSAPP_CONFIG_ID
ARG META_GRAPH_VERSION=v21.0
ARG NUXT_PUBLIC_API_URL

ENV SUPABASE_URL=$SUPABASE_URL \
    SUPABASE_KEY=$SUPABASE_KEY \
    NUXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL \
    NUXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_KEY \
    META_APP_ID=$META_APP_ID \
    META_WHATSAPP_CONFIG_ID=$META_WHATSAPP_CONFIG_ID \
    META_GRAPH_VERSION=$META_GRAPH_VERSION \
    NUXT_PUBLIC_API_URL=$NUXT_PUBLIC_API_URL \
    NODE_ENV=production \
    NITRO_PRESET=node-server

RUN pnpm run build

FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    NITRO_HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_PORT=3000

COPY --from=build /app/.output ./.output

EXPOSE 3000

USER node

CMD ["node", ".output/server/index.mjs"]
