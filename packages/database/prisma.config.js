require("dotenv/config");
const { defineConfig } = require("prisma/config");

/**
 * `datasource.url` is attached only when DATABASE_URL is actually present.
 *
 * It used to be `env("DATABASE_URL")`, and prisma/config's `env()` resolves
 * EAGERLY at config-load time, throwing PrismaConfigEnvError when the variable
 * is missing. Every prisma command loads this file — including `prisma
 * generate`, which reads the schema and emits a client and never opens a
 * connection. So generate could not run without a database URL it had no use
 * for.
 *
 * That broke deploys for apps with no database at all. This package runs
 * `prisma generate` on `postinstall`, and a Vercel build for ANY app in this
 * workspace runs `pnpm install` across all 22 projects — so saroh.in, the
 * marketing site, which has no prisma dependency and never touches a database,
 * failed its install on a missing DATABASE_URL. The obvious workaround is to
 * paste the connection string into every frontend project's environment, which
 * is exactly the credential sprawl 86a91f7 removed.
 *
 * Commands that genuinely need a connection (migrate, db push, studio) still
 * get the URL whenever it is set, and Prisma reports a missing datasource
 * itself when it is not — after `db:guard` has already had its say.
 */
const url = process.env.DATABASE_URL;

module.exports = defineConfig({
    schema: "prisma/schema.prisma",
    ...(url ? { datasource: { url } } : {}),
});
