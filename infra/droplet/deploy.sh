#!/usr/bin/env bash
#
# Roll out an api.saroh.in image built by GitHub Actions. Run ON THE DROPLET,
# from the deploy directory.
#
#     ./deploy.sh                       # deploy :latest
#     ./deploy.sh --tag sha-abc123...   # deploy a specific build (rollback)
#     ./deploy.sh --no-migrate          # skip prisma migrate deploy
#
# This does NOT build. The image comes from ghcr.io/saroh-labs/saroh-api, built
# by .github/workflows/deploy-api.yml. Building a 22-project pnpm monorepo on
# the same host that runs the database would evict Postgres's page cache for
# the duration of the build.
#
# Order matters: pull, migrate, THEN restart. Restarting first would run the old
# code against a migrated schema.

set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TAG="latest"
DO_MIGRATE=1
while [[ $# -gt 0 ]]; do
	case "$1" in
	--tag)
		TAG="$2"
		shift 2
		;;
	--no-migrate)
		DO_MIGRATE=0
		shift
		;;
	*)
		echo "unknown argument: $1" >&2
		exit 1
		;;
	esac
done

[[ -f .env ]] || {
	echo "missing .env — see env.example (SAROH_DB_PASSWORD)" >&2
	exit 1
}
[[ -f .env.prod ]] || {
	echo "missing .env.prod — see env.prod.example" >&2
	exit 1
}

# The infrastructure stack owns postgres, redis and the `edge` network. Without
# it, `up` fails on the external network with a message that does not say why.
docker network inspect edge >/dev/null 2>&1 || {
	echo "the 'edge' network does not exist — is the infrastructure stack up?" >&2
	echo "  start it before deploying — see the operator runbook" >&2
	exit 1
}

REGISTRY_IMAGE="${REGISTRY_IMAGE:-ghcr.io/saroh-labs/saroh-api}"
export SAROH_API_IMAGE="${REGISTRY_IMAGE}:${TAG}"

PREVIOUS="$(docker inspect --format '{{.Config.Image}}' saroh-api 2>/dev/null || echo "none")"

echo "==> pulling $SAROH_API_IMAGE"
docker compose pull api

if ((DO_MIGRATE)); then
	echo "==> prisma migrate deploy (database: saroh)"
	# DATABASE_TARGET_CONFIRM is required, not a workaround. The guard in
	# packages/database/src/database-target.ts allow-lists databases per
	# NODE_ENV and deliberately lists nothing for production, so a production
	# migration has to name its target explicitly.
	#
	# --no-deps because `edge` is external and postgres is not ours to start.
	# This runs alongside the still-serving api; it is short-lived and the
	# droplet has 2 GB of swap.
	#
	# Migrations run as saroh_app, which OWNS the saroh database and therefore
	# has the DDL rights they need. It is a least-privilege role scoped to that
	# one database, not a superuser.
	docker compose run --rm --no-deps \
		-e NODE_ENV=production \
		-e DATABASE_TARGET_CONFIRM=saroh \
		api \
		pnpm --filter @saroh/database run db:migrate:deploy
fi

echo "==> starting api"
docker compose up -d api

# ── Verify ──────────────────────────────────────────────────────────────────
# Readiness, not liveness: this is the check that says the new container can
# actually reach Postgres, which is what a deploy most often breaks.
echo "==> waiting for readiness"
for i in $(seq 1 30); do
	if docker compose exec -T api node -e \
		"fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
		echo "==> ready. running $SAROH_API_IMAGE"
		# Reclaim disk. Each image is well over 1 GB, and the same volume holds
		# Postgres's data directory.
		docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
		exit 0
	fi
	sleep 2
done

echo >&2
echo "api did not become ready. Last 50 log lines:" >&2
docker compose logs --tail=50 api >&2
echo >&2
echo "Previously running: $PREVIOUS" >&2
echo "Roll back with:     ./deploy.sh --tag <previous-sha> --no-migrate" >&2
exit 1
