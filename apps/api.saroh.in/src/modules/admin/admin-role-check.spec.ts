/**
 * The console roles the database accepts are the registry's roles, no more
 * and no fewer (DEC-169, admin console U18).
 *
 * `PlatformAdminRoleAssignment_role_check` is written in migrations and
 * `AdminRole` in code. A role added to one only fails at the first grant on
 * a migrated database (the integration suite's `db push` builds no CHECKs),
 * so this reads the latest definition of the constraint from the migrations
 * and compares. Pattern: `organization-lifecycle.policy.spec.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { AdminRole } from "./admin-permissions";

const MIGRATIONS = join(
    __dirname,
    "../../../../../packages/database/prisma/migrations",
);

/** The roles the latest `PlatformAdminRoleAssignment_role_check` allows. */
function rolesTheDatabaseAllows(): string[] {
    let latest: string | null = null;
    for (const dir of readdirSync(MIGRATIONS).sort()) {
        let sql: string;
        try {
            sql = readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf8");
        } catch {
            continue;
        }
        const pattern =
            /"PlatformAdminRoleAssignment_role_check"\s+CHECK\s*\(\s*"role"\s+IN\s*\(([\s\S]*?)\)\s*\)/g;
        for (const match of sql.matchAll(pattern)) latest = match[1] ?? null;
    }
    if (!latest) {
        throw new Error("No PlatformAdminRoleAssignment_role_check found");
    }
    return [...latest.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1] ?? "");
}

describe("the console role CHECK (DEC-169)", () => {
    it("allows exactly the registry's roles", () => {
        expect(rolesTheDatabaseAllows().sort()).toEqual(
            Object.values(AdminRole).sort(),
        );
    });

    it("includes the Account manager", () => {
        expect(rolesTheDatabaseAllows()).toContain(AdminRole.AccountManager);
    });
});
