import { assertDatabaseTarget } from "./database-target";
import { loadEnvFallback } from "./load-env";

/**
 * Gate for the Prisma CLI commands, which cannot import the guard themselves.
 * Chained ahead of them in package.json (`db:guard && prisma migrate deploy`)
 * so a refusal stops the command instead of warning after the fact.
 */
loadEnvFallback();

try {
    const target = assertDatabaseTarget();
    console.log(`database target ok: ${target.database} on ${target.host}`);
} catch (error) {
    console.error(
        `\n${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
}
