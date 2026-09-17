# node:24-slim (glibc), not -alpine: Next.js's own SWC/Turbopack native
# bindings only ship glibc builds, so npm install must run on the same libc
# as the final runtime or the build's native bindings won't load at runtime.
FROM node:26-slim AS deps
WORKDIR /app
# better-sqlite3/bcrypt ship prebuilt binaries for common platforms, but
# fall back to compiling from source if none matches — keep the toolchain
# available so that fallback doesn't just fail the build.
RUN apt-get update -qq && apt-get install -y -qq python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:26-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:26-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Docker auto-sets HOSTNAME to the container ID; Next's standalone server.js
# reads process.env.HOSTNAME as its bind address, so without this override it
# ends up bound to whatever that ID happens to resolve to on ONE of this
# container's two networks (internal/proxy) instead of all interfaces —
# reachable from one network, silently unreachable from the other.
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# node:24-slim already has a non-root "node" user (uid/gid 1000) baked in —
# run as that instead of root. The host-side bind mounts this writes to
# (console/data, .env) must be chown'd to 1000:1000 to match, or the app
# can start but fail every write (see README's setup instructions).
USER node
EXPOSE 3000
CMD ["node", "server.js"]
