import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load `packages/database/.env` into `process.env`, by hand.
 *
 * turbo and tsx do not auto-load `.env`, and `dotenv` is deliberately not a
 * dependency of this package. This was inline in `seed.ts`; it moved here so
 * the database-target guard can use the same loader rather than importing a
 * hoisted `dotenv` it does not declare.
 *
 * Yields to anything already set, matching `dotenv`'s behaviour — which is
 * exactly why the guard exists: a `DATABASE_URL` inherited from the shell wins
 * over this file, and the root `.env` names a different Neon project.
 *
 * This module is CommonJS (the package sets no `"type": "module"`), so
 * `__dirname` is available.
 */
export function loadEnvFallback(): void {
    if (process.env.DATABASE_URL) return;
    const envPath = resolve(__dirname, "..", ".env");
    if (!existsSync(envPath)) return;

    for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (process.env[key]) continue;
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}
