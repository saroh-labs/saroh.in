# syntax=docker/dockerfile:1.7
#
# api.saroh.in — NestJS, built out of the pnpm monorepo.
#
# Built by .github/workflows/deploy-api.yml on GitHub's runners and pushed to
# ghcr.io/saroh-labs/saroh-api. It is NOT built on the deployment host: that
# box also runs the database, and a `pnpm install` + `turbo build` across this
# subgraph would evict Postgres's page cache for the duration. The host only
# ever pulls.
#
# To build by hand, from the REPO ROOT (not this directory):
#     docker build -f apps/api.saroh.in/Dockerfile -t saroh-api .
#
# The whole repo is the build context because stage 1 needs it: `turbo prune`
# has to see every workspace manifest to work out what @saroh/api actually
# depends on. What survives into the later stages is only that subgraph — the
# api plus @saroh/{auth,database,object-storage,templates} and the two tooling
# packages. The ten Next.js frontends never enter the image.

# ── Base ────────────────────────────────────────────────────────────────────
# Node 24 to match .nvmrc and the ">=24" engines constraint. Debian slim rather
# than alpine: Prisma's engines are glibc/OpenSSL binaries and musl is the
# well-known way to lose an afternoon to them.
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    CI=1
# openssl is a Prisma engine runtime requirement; ca-certificates is needed for
# the TLS connection to Azure Database for PostgreSQL, which refuses plaintext.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
# Installed directly rather than through corepack. The version is pinned to the
# root package.json `packageManager` field — keep the two in step.
RUN npm install -g pnpm@9.9.0

# ── Stage 1: prune ──────────────────────────────────────────────────────────
# Emits /repo/out/json (manifests + lockfile, for a cacheable install layer) and
# /repo/out/full (the pruned sources).
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.10.9 prune @saroh/api --docker

# ── Stage 2: install + build ────────────────────────────────────────────────
FROM base AS builder
WORKDIR /repo

# Manifests first, so the install layer is reused on any commit that does not
# touch a package.json or the lockfile. This is what makes CI builds fast.
COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml

# The Prisma schema has to be in place BEFORE install, because @saroh/database
# runs `prisma generate` on postinstall and generate reads the schema. Copying
# it here (rather than with the rest of the source) keeps the install layer
# cacheable while still letting that hook succeed.
#
# The hook also relies on pnpm setting NODE_PATH to the hoisted virtual store
# for lifecycle scripts: packages/database/prisma.config.js does
# `require("dotenv/config")` but @saroh/database does not declare dotenv as a
# dependency, so generate resolves it ONLY as a pnpm-run script. Do not
# "helpfully" add a bare `RUN pnpm exec prisma generate` below — outside the
# lifecycle-script environment it fails with `Cannot find module 'dotenv/config'`.
COPY --from=pruner /repo/out/full/packages/database/prisma ./packages/database/prisma
COPY --from=pruner /repo/out/full/packages/database/prisma.config.js ./packages/database/prisma.config.js

RUN pnpm install --frozen-lockfile

# Now the sources, then the build. turbo's `build` task declares
# dependsOn ["^build"], so this also builds the four workspace packages the api
# imports — each of which resolves through its `dist/`, not its source.
COPY --from=pruner /repo/out/full/ ./
# No DATABASE_URL exists at image-build time and the api validates its env at
# import time. The runtime stage does NOT set this — a misconfigured container
# must still fail loudly at boot rather than serve with a broken config.
RUN SKIP_ENV_VALIDATION=1 pnpm turbo run build --filter=@saroh/api

# ── Stage 3: runtime ────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /repo

ENV NODE_ENV=production \
    PORT=3333 \
    # The container runs under a 448MB memory limit. Left unbounded, V8 sizes
    # its heap from the HOST's total memory — not the cgroup limit — and grows
    # until Docker OOM-kills the container. 320MB is comfortably above this
    # app's steady state, and the ~128MB gap covers Prisma's native query
    # engine, socket buffers and the Node binary itself, none of which live in
    # the V8 old space this flag bounds. Overridden by docker-compose.yml.
    NODE_OPTIONS="--max-old-space-size=320"

# The whole installed tree is carried over rather than a pruned production
# subset. It is deliberate: the generated Prisma client lives inside the pnpm
# virtual store (node_modules/.pnpm/@prisma+client@.../), the workspace packages
# resolve through symlinks into that same store, and every scheme for slimming
# this down risks severing one of those links. It also keeps the prisma CLI
# available, which is what runs `migrate deploy` on the VM.
COPY --from=builder --chown=node:node /repo ./

USER node
EXPOSE 3333

# Liveness, not readiness. /health/ready returns 503 when the database is
# unreachable, and a dropped upstream is not a reason for docker to declare
# this container unhealthy and cycle it — see the process guards in
# src/main.ts, which exist because exactly that kind of transient took the api
# down before.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3333)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api.saroh.in/dist/main"]
