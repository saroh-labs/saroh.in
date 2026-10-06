import { describe, expect, it, vi } from "vitest";

import type { Db } from "./helpers";
import {
    SAROH_EMAIL_BUSINESSES,
    seedSarohEmailBusinesses,
} from "./saroh-email";

vi.mock("./pricing", () => ({
    seedPlanId: vi.fn(() => Promise.resolve("plan_pro")),
}));

interface Call {
    model: string;
    args: {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
    };
}

/** A Db that records every upsert and writes nothing. */
function recorder(): { db: Db; calls: Call[] } {
    const calls: Call[] = [];
    const db = new Proxy(
        {},
        {
            get: (_t, model: string) => ({
                upsert: (args: Call["args"]) => {
                    calls.push({ model, args });
                    return Promise.resolve(args.create);
                },
            }),
        },
    ) as unknown as Db;
    return { db, calls };
}

describe("Asha's Saroh-email businesses (DEC-086)", () => {
    it("turns the route on for its own two businesses and nobody else", async () => {
        const { db, calls } = recorder();
        await seedSarohEmailBusinesses(db, "seed_user_founder", new Date());

        const ids = SAROH_EMAIL_BUSINESSES.map(
            (b) => `seed_org_saroh-email_${b.key}`,
        );
        // Flags are registered dark and never re-set.
        for (const c of calls.filter((c) => c.model === "featureFlag")) {
            expect(c.args.create.enabledByDefault).toBe(false);
            expect(c.args.update).toEqual({});
        }
        // Every override, subscription and module is one of the two's.
        const scoped = calls.filter((c) =>
            [
                "featureFlagOverride",
                "subscription",
                "organizationModule",
                "businessProfile",
                "membership",
            ].includes(c.model),
        );
        expect(scoped.length).toBeGreaterThan(0);
        for (const c of scoped) {
            expect(ids).toContain(c.args.create.organizationId);
        }
        const on = calls
            .filter((c) => c.model === "featureFlagOverride")
            .map(
                (c) =>
                    `${String(c.args.create.organizationId)} ${String(c.args.create.flagKey)}`,
            );
        for (const org of ids) {
            expect(on).toContain(`${org} SAROH_BUSINESS_EMAIL`);
            expect(on).toContain(`${org} PLAN_ENFORCEMENT`);
            expect(on).toContain(`${org} MODULE_COMMUNICATIONS`);
        }
        // Every row it writes is the seed's, so the reset removes it.
        for (const c of calls.filter((c) => c.model !== "featureFlag")) {
            expect(String(c.args.create.id)).toMatch(/^seed_/);
        }
    });
});
