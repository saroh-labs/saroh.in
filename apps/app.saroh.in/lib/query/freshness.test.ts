/**
 * Each read is as fresh as its tier says (owner, 25 Nov 2026), and every
 * read the app defines has one.
 */
import { describe, expect, it } from "vitest";

import * as bookings from "@/lib/bookings/queries";
import * as calendar from "@/lib/calendar/queries";
import * as customers from "@/lib/customers/queries";
import * as home from "@/lib/home/queries";
import * as invoices from "@/lib/invoices/queries";
import * as orders from "@/lib/orders/queries";
import * as products from "@/lib/products/queries";
import { defineRead } from "@/lib/query/define-read";
import { FRESHNESS, SETTINGS_REFRESH_MS, TIERS } from "@/lib/query/freshness";
import { domainKey } from "@/lib/query/keys";
import * as shell from "@/lib/shell/queries";
import * as stock from "@/lib/stock/queries";

const probe = (tier: (typeof TIERS)[number]) =>
    defineRead<string[]>()({
        key: (orgId) => domainKey("probe", orgId, tier),
        route: { path: "/api/probe", params: {} },
        tier,
    }).options("org_a", {});

describe("freshness", () => {
    it("settings: kept for the visit, read again every 10 minutes", () => {
        const o = probe("settings");
        expect(o.staleTime).toBe(Infinity);
        expect(o.gcTime).toBe(Infinity);
        expect(o.refetchInterval).toBe(SETTINGS_REFRESH_MS);
        expect(o.meta).toEqual({ tier: "settings" });
    });

    it("records: 5 minutes; live: 30 seconds, no timer of its own", () => {
        expect(probe("records").staleTime).toBe(5 * 60_000);
        expect(probe("records").refetchInterval).toBeUndefined();
        expect(probe("live").staleTime).toBe(30_000);
        // The live refresh's 45 s tick owns the timer: two would read twice.
        expect(probe("live").refetchInterval).toBeUndefined();
    });

    it("every read the app defines names a known tier", () => {
        const reads = [
            bookings,
            calendar,
            customers,
            home,
            invoices,
            orders,
            products,
            shell,
            stock,
        ]
            .flatMap((m): unknown[] => Object.values(m))
            .filter(
                (v): v is { tier: string; path: string } =>
                    typeof v === "object" && v !== null && "tier" in v,
            );
        expect(reads.length).toBeGreaterThanOrEqual(22);
        for (const r of reads) {
            expect(TIERS, r.path).toContain(r.tier);
            expect(FRESHNESS[r.tier as keyof typeof FRESHNESS]).toBeDefined();
        }
    });
});
