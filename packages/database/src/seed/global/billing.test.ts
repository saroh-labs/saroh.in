import { describe, expect, it } from "vitest";

import { createRng } from "../showcase/random";
import { planBilling } from "./billing";
import { IRONVALE, THISTLEWICK } from "./data";
import { morningZone } from "./morning-zone";

const DAY = 86_400_000;

// A week of mornings at different hours: the seed runs at any time.
const NOWS = Array.from(
    { length: 7 },
    (_, i) => new Date(Date.UTC(2026, 10, 10 + i, (i * 5) % 24, 30)),
);

describe("Global memberships", () => {
    for (const fixture of [THISTLEWICK, IRONVALE]) {
        it(`${fixture.name}: one failed renewal, one paused, the rest renewing`, () => {
            for (const now of NOWS) {
                const biz = { ...fixture, zone: morningZone(now) };
                const people = Array.from({ length: 30 }, (_, i) => ({
                    contactId: `c${i}`,
                    name: `Person ${i}`,
                    email: `p${i}@example.com`,
                }));
                const { plans, subs, docs } = planBilling(biz, {
                    orgId: "org",
                    sid: (...p) => p.join("_"),
                    rng: (c) => createRng(c.length),
                    now,
                    demoUserId: "u",
                    people,
                });
                expect(plans).toHaveLength(biz.memberships?.plans.length ?? 0);
                expect(new Set(subs.map((s) => s.contactId)).size).toBe(
                    subs.length,
                );
                expect(subs.filter((s) => s.status === "PAUSED")).toHaveLength(
                    1,
                );
                // Failed: its latest invoice unpaid and past its due date.
                const failed = subs.filter((s) => {
                    const own = docs
                        .filter((d) => d.subscriptionId === s.id)
                        .sort((a, b) => +a.issuedAt - +b.issuedAt);
                    const last = own.at(-1);
                    return (
                        s.status === "ACTIVE" &&
                        last?.status === "ISSUED" &&
                        last.dueAt < now
                    );
                });
                expect(failed).toHaveLength(1);
                for (const s of subs) {
                    expect(+new Date(s.currentPeriodEnd)).toBeGreaterThan(
                        s.status === "PAUSED"
                            ? +new Date(s.pausedAt as Date)
                            : +now,
                    );
                }
                // Every period's invoice is issued by now, none in the future.
                for (const d of docs) {
                    expect(+d.issuedAt).toBeLessThanOrEqual(+now);
                    expect(+d.dueAt - +d.issuedAt).toBe(7 * DAY);
                }
                expect(
                    docs.every((d) => !/₹|GST/.test(d.lines[0].description)),
                ).toBe(true);
            }
        });
    }
});
