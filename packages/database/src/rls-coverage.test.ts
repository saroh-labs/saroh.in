import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
    checkTable,
    loadRepoSchemaAndMigrations,
    readSchemaModels,
    replayRls,
} from "./rls-coverage";

/**
 * Every table either carries the org-isolation policy (ENABLEd, FORCEd, with
 * the empty-string-safe permissive branch) or is named here with the reason it
 * is not business-owned (#53). A new model with `organizationId` and no policy
 * fails this test; so does a child table that reaches an organization only
 * through its parent (the B2 shape) — both have to be decided, not forgotten.
 */
const NOT_TENANT_OWNED: Record<string, string> = {
    Organization:
        "The tenant root. Read by id across organizations by the business chooser and by OrganizationGuard before any org context exists.",
    User: "A person, not a business: one user belongs to many organizations.",
    Session: "Better Auth session of a user; spans organizations.",
    Account: "Better Auth credential of a user; spans organizations.",
    Verification: "Better Auth email and reset tokens; no organization.",
    FeatureFlag:
        "Platform-wide flag definitions; no organizationId column (per-org overrides live in FeatureFlagOverride, which has its own policy).",
    Plan: "The global plan catalogue, shared by every organization.",
    PlatformAdmin: "Saroh staff, not a business.",
    PlatformAdminRoleAssignment: "Saroh staff roles, not a business.",
    AdminOperation:
        "A staff bulk operation (jobs retry, webhook replay) across organizations; no organization of its own.",
    AdminOperationItem: "Child of AdminOperation; no organization.",
    WaitlistSignup:
        "A marketing-site waitlist entry, before any organization exists.",
};

const databaseDir = path.resolve(__dirname, "..");

describe("row-level security coverage", () => {
    const { schema, migrations } = loadRepoSchemaAndMigrations(databaseDir);
    const models = readSchemaModels(schema);
    const rls = replayRls(migrations);

    it("reads the schema and the migrations", () => {
        expect(models.length).toBeGreaterThan(50);
        expect(rls.size).toBeGreaterThan(50);
    });

    it("gives every table a policy or a reason", () => {
        const problems = models
            .map((m) => checkTable(m, rls.get(m.table), NOT_TENANT_OWNED))
            .filter((p): p is string => p !== null);
        expect(problems).toEqual([]);
    });

    it("names only models that exist in the allow-list", () => {
        const names = new Set(models.map((m) => m.model));
        expect(
            Object.keys(NOT_TENANT_OWNED).filter((n) => !names.has(n)),
        ).toEqual([]);
    });

    it("keeps no model with organizationId in the allow-list", () => {
        const withOrg = models
            .filter((m) => m.hasOrganizationId && m.model in NOT_TENANT_OWNED)
            .map((m) => m.model);
        expect(withOrg).toEqual([]);
    });

    it("fails when one table's policy is dropped", () => {
        const dropped = [
            ...migrations,
            `DROP POLICY IF EXISTS "org_isolation" ON "SavedView";`,
        ];
        const after = replayRls(dropped);
        const savedView = models.find((m) => m.model === "SavedView");
        if (!savedView) throw new Error("SavedView is not in the schema");
        expect(
            checkTable(savedView, after.get("SavedView"), NOT_TENANT_OWNED),
        ).toMatch(
            /SavedView \("SavedView"\) has organizationId but has no RLS policy/,
        );
    });

    it("fails when a policy has no empty-string-safe branch, or RLS is not forced", () => {
        const model = { model: "X", table: "X", hasOrganizationId: true };
        const naive = replayRls([
            `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;
             ALTER TABLE "X" FORCE ROW LEVEL SECURITY;
             CREATE POLICY "org_isolation" ON "X"
               USING (current_setting('app.current_organization_id', true) IS NULL
                      OR "organizationId" = current_setting('app.current_organization_id', true));`,
        ]);
        expect(checkTable(model, naive.get("X"), {})).toMatch(
            /empty-string-safe/,
        );

        const unforced = replayRls([
            `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;
             CREATE POLICY "p" ON "X" USING (true);`,
        ]);
        expect(checkTable(model, unforced.get("X"), {})).toMatch(/not FORCEd/);
    });
});
