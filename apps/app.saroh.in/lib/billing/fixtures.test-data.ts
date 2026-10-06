import type { BillingAccessView, ModuleAccessView } from "./access";

/**
 * Made-up access for tests: Plan A/B/C at 111 and 222 — never a real plan's
 * names, prices or limits.
 */
export function row(over: Partial<ModuleAccessView> = {}): ModuleAccessView {
    return {
        moduleId: "products",
        name: "Things",
        what: "Things you sell.",
        state: "on",
        limit: 10,
        per: "",
        text: "10",
        override: "",
        usage: 0,
        menu: "sell",
        child: "Products",
        upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
        ...over,
    };
}

export function access(
    over: Partial<BillingAccessView> = {},
): BillingAccessView {
    return {
        source: "catalogue",
        enforced: true,
        version: 3,
        plan: { id: "a", name: "Plan A" },
        pricePaise: 0,
        planOverride: null,
        pendingMove: null,
        modules: [row()],
        ...over,
    };
}

/** The `payments` row (taking money online), on or locked. */
export function paymentsRow(state: "on" | "locked"): ModuleAccessView {
    return row({
        moduleId: "payments",
        name: "Online payments",
        what: "Take payment online.",
        state,
        limit: null,
        usage: null,
        menu: null,
        child: null,
    });
}

/** A plan without online payments (Plan A), enforced. */
export function offlinePlan(
    over: Partial<BillingAccessView> = {},
): BillingAccessView {
    return access({ modules: [paymentsRow("locked")], ...over });
}

/** A plan with online payments (Plan B), enforced. */
export function onlinePlan(): BillingAccessView {
    return access({
        plan: { id: "b", name: "Plan B" },
        modules: [paymentsRow("on")],
    });
}
