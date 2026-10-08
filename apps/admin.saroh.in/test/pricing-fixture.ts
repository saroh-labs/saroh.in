import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";

import type {
    AdminDraft,
    AdminPricing,
    AdminVersion,
    StaffName,
} from "@/lib/pricing-types";

/**
 * Made-up pricing for the console's tests. Names, prices and limits are fake
 * on purpose (Plan A/B/C, 111, 222): no test carries a real plan's numbers.
 */
export function fakeCatalog(): Catalog {
    return parseCatalog({
        plans: [
            { id: "a", name: "Plan A", pricePaise: 0, cta: "Try A" },
            {
                id: "b",
                name: "Plan B",
                pricePaise: 11_100,
                cta: "Try B",
                featured: true,
            },
            { id: "c", name: "Plan C", pricePaise: 22_200, cta: "Try C" },
        ],
        groups: [{ id: "g1", name: "Group one" }],
        modules: [
            {
                id: "products",
                name: "Things",
                group: "g1",
                cells: {
                    a: { inc: true, text: "11", limit: 11 },
                    b: { inc: true, text: "111", limit: 111 },
                    c: { inc: true, text: "222", limit: 222 },
                },
            },
        ],
        yearly: { on: false, paid: 10 },
        gst: { show: "excl" },
    });
}

export const ASHA: StaffName = {
    userId: "u-asha",
    name: "Asha",
    email: "asha@example.test",
};
export const RAVI: StaffName = {
    userId: "u-ravi",
    name: "Ravi",
    email: "ravi@example.test",
};

export function fakeVersion(over: Partial<AdminVersion> = {}): AdminVersion {
    return {
        version: 1,
        goLiveAt: "2026-09-26T00:00:00.000Z",
        status: "live",
        policy: "keep",
        note: "",
        changes: [],
        publishedBy: null,
        createdAt: "2026-09-26T00:00:00.000Z",
        businesses: 3,
        moving: 0,
        sync: { pending: 0, synced: 0, failed: 0 },
        catalog: fakeCatalog(),
        ...over,
    };
}

export function fakeDraft(over: Partial<AdminDraft> = {}): AdminDraft {
    const catalog = fakeCatalog();
    catalog.plans = catalog.plans.map((p) =>
        p.id === "b" ? { ...p, pricePaise: 22_200 } : p,
    );
    return {
        catalog,
        revision: 3,
        baseVersion: 1,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        updatedBy: RAVI,
        editors: [RAVI],
        valid: true,
        errors: [],
        changes: [],
        ...over,
    };
}

export function fakePricing(over: Partial<AdminPricing> = {}): AdminPricing {
    return {
        now: "2026-10-03T00:00:00.000Z",
        liveVersion: 1,
        draft: null,
        versions: [fakeVersion()],
        editing: "live",
        plans: [],
        usage: {},
        businesses: { total: 3, measured: [] },
        ...over,
    };
}
