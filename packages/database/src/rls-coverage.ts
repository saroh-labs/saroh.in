import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

/**
 * What the migration history leaves each table with, row-level-security-wise
 * (#53). Read from the SQL text, in migration order, so it describes what a
 * database built by `prisma migrate deploy` ends up with — the integration
 * suite's `db push` never runs a migration, so no database test could see a
 * table that was quietly left out.
 */
export interface TableRls {
    enabled: boolean;
    forced: boolean;
    /** Policy name -> the final CREATE POLICY statement for it. */
    policies: Map<string, string>;
}

export interface SchemaModel {
    model: string;
    /** The Postgres table name (`@@map`, or the model name). */
    table: string;
    hasOrganizationId: boolean;
}

/** Every model in `schema.prisma`, with its table and whether it has `organizationId`. */
export function readSchemaModels(schema: string): SchemaModel[] {
    const models: SchemaModel[] = [];
    const modelRe = /^model (\w+) \{([\s\S]*?)^\}/gm;
    for (const m of Array.from(schema.matchAll(modelRe))) {
        const [, model, body] = m;
        const map = /@@map\("([^"]+)"\)/.exec(body);
        models.push({
            model,
            table: map ? map[1] : model,
            hasOrganizationId: /^\s+organizationId\s/m.test(body),
        });
    }
    return models;
}

const EVENT_RE = new RegExp(
    [
        String.raw`ALTER TABLE\s+(?:IF EXISTS\s+)?(?:ONLY\s+)?"(\w+)"\s+(ENABLE|DISABLE|FORCE|NO FORCE) ROW LEVEL SECURITY`,
        String.raw`CREATE POLICY\s+"(\w+)"\s+ON\s+"(\w+)"[\s\S]*?(?:;|\$stmt\$)`,
        String.raw`DROP POLICY\s+(?:IF EXISTS\s+)?"(\w+)"\s+ON\s+"(\w+)"`,
        String.raw`DROP TABLE\s+(?:IF EXISTS\s+)?"(\w+)"`,
        String.raw`ALTER TABLE\s+"(\w+)"\s+RENAME TO\s+"(\w+)"`,
    ].join("|"),
    "g",
);

/**
 * Replay the RLS statements of every migration, in order, and return the
 * resulting state per table. `DO` blocks (the guarded early migrations) are
 * read like plain statements: where one skipped a table on a fresh database,
 * `rls_backfill_org_isolation` applied the same policy later.
 */
export function replayRls(
    migrationSql: readonly string[],
): Map<string, TableRls> {
    const tables = new Map<string, TableRls>();
    const get = (t: string): TableRls => {
        let s = tables.get(t);
        if (!s) {
            s = { enabled: false, forced: false, policies: new Map() };
            tables.set(t, s);
        }
        return s;
    };

    for (const sql of migrationSql) {
        // Line comments carry table names in prose; drop them first.
        const code = sql.replace(/--[^\n]*/g, "");
        for (const e of Array.from(code.matchAll(EVENT_RE))) {
            if (e[1]) {
                const s = get(e[1]);
                if (e[2] === "ENABLE") s.enabled = true;
                else if (e[2] === "DISABLE") s.enabled = false;
                else if (e[2] === "FORCE") s.forced = true;
                else s.forced = false;
            } else if (e[3]) {
                get(e[4]).policies.set(e[3], e[0]);
            } else if (e[5]) {
                get(e[6]).policies.delete(e[5]);
            } else if (e[7]) {
                tables.delete(e[7]);
            } else if (e[8]) {
                const s = tables.get(e[8]);
                tables.delete(e[8]);
                if (s) tables.set(e[9], s);
            }
        }
    }
    return tables;
}

/** The empty-string-safe "no org context" branch every policy must start with. */
const PERMISSIVE_WHEN_UNSET =
    "NULLIF(current_setting('app.current_organization_id', true), '') IS NULL";

/**
 * Why a table is covered, or the reason it is not. An error string names what
 * is wrong; `null` means the table is fine.
 */
export function checkTable(
    model: SchemaModel,
    rls: TableRls | undefined,
    allowList: Readonly<Record<string, string>>,
): string | null {
    const covered = !!rls && rls.policies.size > 0;
    if (model.model in allowList) {
        if (!allowList[model.model].trim())
            return `${model.model}: allow-list entry has no reason`;
        if (covered) {
            return `${model.model}: has an RLS policy and an allow-list entry — remove the entry`;
        }
        return null;
    }
    if (!covered) {
        return `${model.model} ("${model.table}")${
            model.hasOrganizationId ? " has organizationId but" : ""
        } has no RLS policy in any migration. Add one (see docs/architecture/RLS_ROLLOUT_AND_OPS.md) or an allow-list entry with a reason.`;
    }
    if (!rls.enabled)
        return `${model.model}: policy exists but RLS is not ENABLEd`;
    if (!rls.forced) return `${model.model}: RLS is enabled but not FORCEd`;
    for (const [name, stmt] of Array.from(rls.policies)) {
        const using = stmt.split(/WITH CHECK/)[0];
        const check = stmt.split(/WITH CHECK/)[1] ?? "";
        if (
            !using.includes(PERMISSIVE_WHEN_UNSET) ||
            !check.includes(PERMISSIVE_WHEN_UNSET)
        ) {
            return `${model.model}: policy "${name}" lacks the empty-string-safe NULLIF(...) IS NULL branch in USING and WITH CHECK`;
        }
    }
    return null;
}

/** Read the repo's schema and migrations (ordered by directory name). */
export function loadRepoSchemaAndMigrations(databaseDir: string): {
    schema: string;
    migrations: string[];
} {
    const prismaDir = path.join(databaseDir, "prisma");
    const migrationsDir = path.join(prismaDir, "migrations");
    const dirs = readdirSync(migrationsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    return {
        schema: readFileSync(path.join(prismaDir, "schema.prisma"), "utf8"),
        migrations: dirs.map((d) =>
            readFileSync(path.join(migrationsDir, d, "migration.sql"), "utf8"),
        ),
    };
}
