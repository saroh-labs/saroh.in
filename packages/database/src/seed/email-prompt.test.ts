import { describe, expect, it, vi } from "vitest";

import { seedEmailPromptBusinesses } from "./email-prompt";
import type { Db } from "./helpers";

vi.mock("./pricing", () => ({
    SEED_PLAN_ID: "pro",
    SEED_ENTRY_PLAN_ID: "free",
    seedPlanId: vi.fn((_db: unknown, _now: Date, key: string) =>
        Promise.resolve(`plan_${key}`),
    ),
}));

interface Call {
    model: string;
    args: { create: Record<string, unknown>; update: Record<string, unknown> };
}

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

const ids = ["desk", "phone", "free"].map((k) => `seed_org_email-prompt_${k}`);

describe("Asha's businesses for the email prompt (#850)", () => {
    it("rolls Communications out for them alone, and enforces the plan only on the free one", async () => {
        const { db, calls } = recorder();
        await seedEmailPromptBusinesses(db, "seed_user_founder", new Date());

        for (const c of calls.filter((c) => c.model === "featureFlag")) {
            expect(c.args.create.enabledByDefault).toBe(false);
            expect(c.args.update).toEqual({});
        }
        const on = calls
            .filter((c) => c.model === "featureFlagOverride")
            .map(
                (c) =>
                    `${String(c.args.create.organizationId)} ${String(c.args.create.flagKey)}`,
            );
        expect(on.sort()).toEqual(
            [
                "seed_org_email-prompt_desk MODULE_COMMUNICATIONS",
                "seed_org_email-prompt_phone MODULE_COMMUNICATIONS",
                "seed_org_email-prompt_free MODULE_COMMUNICATIONS",
                "seed_org_email-prompt_free PLAN_ENFORCEMENT",
            ].sort(),
        );
        const plans = Object.fromEntries(
            calls
                .filter((c) => c.model === "subscription")
                .map((c) => [
                    String(c.args.create.organizationId),
                    c.args.create.planId,
                ]),
        );
        expect(plans).toEqual({
            "seed_org_email-prompt_desk": "plan_pro",
            "seed_org_email-prompt_phone": "plan_pro",
            "seed_org_email-prompt_free": "plan_free",
        });
        // Nothing outside its own businesses, and every row the seed's.
        for (const c of calls.filter((c) => c.model !== "featureFlag")) {
            expect(String(c.args.create.id)).toMatch(/^seed_/);
            if (c.model !== "organization") {
                expect(ids).toContain(c.args.create.organizationId);
            }
        }
        // No provider is ever written.
        expect(calls.some((c) => c.model === "communicationProvider")).toBe(
            false,
        );
    });
});
