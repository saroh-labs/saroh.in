import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { assertDatabaseTarget } from "../database-target";
import {
    DEMO_BUSINESSES,
    DEMO_GYM,
    DEMO_SALON,
    makeDemoBusinesses,
} from "./demo-businesses";

/**
 * The demo fixtures, and the whole write run against a client that records
 * every call: each site section goes through the block contract on the way
 * (`writeSite`), so a section the demo can't publish fails here. The rows
 * themselves are checked against Postgres in the API's
 * `demo-businesses.db.spec.ts`.
 */

interface Call {
    model: string;
    method: string;
    args: Record<string, unknown>;
}

function recordingClient(
    /** Who holds each address already, by slug. */
    holders: Record<string, string> = {},
): { db: PrismaClient; calls: Call[] } {
    const calls: Call[] = [];
    const delegate = (model: string) =>
        new Proxy(
            {},
            {
                get: (_, method: string) => (args: Record<string, unknown>) => {
                    calls.push({ model, method, args });
                    if (method === "count") return Promise.resolve(0);
                    if (method === "findUnique" || method === "findFirst") {
                        const slug = (args.where as { slug?: string }).slug;
                        const holder = slug ? holders[slug] : undefined;
                        return Promise.resolve(holder ? { id: holder } : null);
                    }
                    const where = (args.where ?? {}) as { id?: unknown };
                    const create = (args.create ?? {}) as { id?: unknown };
                    return Promise.resolve({ id: create.id ?? where.id });
                },
            },
        );
    const tx: Record<string, unknown> = new Proxy(
        {},
        { get: (_, model: string) => delegate(model) },
    );
    const db = new Proxy(
        {},
        {
            get: (_, key: string) =>
                key === "$transaction"
                    ? (fn: (t: unknown) => Promise<unknown>) => fn(tx)
                    : delegate(key),
        },
    ) as unknown as PrismaClient;
    return { db, calls };
}

describe("the demo businesses (DEC-188)", () => {
    it("are a salon and a gym at their own addresses, on fixed ids", () => {
        expect(DEMO_BUSINESSES.map((b) => [b.id, b.address])).toEqual([
            ["demo_salon", "demo-salon"],
            ["demo_gym", "demo-gym"],
        ]);
        for (const b of DEMO_BUSINESSES) {
            expect(b.site.subdomain).toBe(b.address);
            expect(b.site.published).toBe(true);
            expect(b.owner.email).toMatch(/@example\.com$/);
        }
    });

    it("have services, people who take them, and opening hours", () => {
        for (const b of DEMO_BUSINESSES) {
            expect(b.services.length).toBeGreaterThan(0);
            expect(b.openingHours).toHaveLength(7);
            for (const p of b.staff) {
                for (const i of p.services) {
                    expect(b.services[i]).toBeDefined();
                }
            }
        }
        // The gym's classes have their own weekly times.
        expect(DEMO_GYM.services.every((s) => s.rules.length > 0)).toBe(true);
    });

    it("leave the journal out: a demo has no posts", () => {
        for (const b of [DEMO_SALON, DEMO_GYM]) {
            const types = b.site.pages.flatMap((p) =>
                p.sections.map((s) => s.type),
            );
            expect(types).not.toContain("journal");
            expect(b.site.navigationExtra).toBeUndefined();
        }
    });

    it("write each as a demo on Pro with no subscription, and publish its site", async () => {
        const { db, calls } = recordingClient();
        const report = await makeDemoBusinesses(db, {
            now: new Date("2026-10-24T06:00:00.000Z"),
        });
        expect(report.dryRun).toBe(false);
        expect(report.created).toBe(0);
        expect(report.planOnLiveCatalogue).toBeNull();

        const orgs = calls.filter(
            (c) => c.model === "organization" && c.method === "upsert",
        );
        expect(orgs.map((c) => c.args.create)).toMatchObject([
            { id: "demo_salon", slug: "demo-salon", isDemo: true },
            { id: "demo_gym", slug: "demo-gym", isDemo: true },
        ]);
        const plans = calls.filter(
            (c) => c.model === "entitlementOverride" && c.method === "upsert",
        );
        expect(plans.map((c) => c.args.update)).toMatchObject([
            { kind: "plan", planKey: "pro", expiresAt: null, revokedAt: null },
            { kind: "plan", planKey: "pro", expiresAt: null, revokedAt: null },
        ]);
        expect(
            calls.filter(
                (c) => c.model === "subscription" && c.method !== "count",
            ),
        ).toEqual([
            expect.objectContaining({ method: "deleteMany" }),
            expect.objectContaining({ method: "deleteMany" }),
        ]);
        expect(
            calls.filter(
                (c) => c.model === "publication" && c.method === "upsert",
            ),
        ).toHaveLength(2);
        // No password: the owner never gets an Account.
        expect(calls.some((c) => c.model === "account")).toBe(false);
    });

    it("refuses an address another business holds", async () => {
        const { db } = recordingClient({ "demo-salon": "someone" });
        await expect(makeDemoBusinesses(db)).rejects.toThrow(
            /"demo-salon" is another business's/,
        );
    });

    it("runs only after the target guard: an unconfirmed production URL is refused", () => {
        expect(() =>
            assertDatabaseTarget(
                "postgresql://u:p@db.internal:5432/saroh-prod",
                "production",
                undefined,
            ),
        ).toThrow();
    });
});
