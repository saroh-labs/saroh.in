import { formatMoneyMajor } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import type { Discount } from "./service";

/** "15% off", "₹10.00 off". */
export function ruleOf(
    d: Pick<Discount, "kind" | "percent" | "amount" | "currency">,
): string {
    if (d.kind === "PERCENTAGE") return `${d.percent ?? "?"}% off`;
    return `${formatMoneyMajor(d.amount ?? "0", d.currency ?? "")} off`;
}

/** What the code reaches, in a phrase: "everything", "Hill Road", "3 products". */
export function reachOf(d: Pick<Discount, "appliesTo" | "targets">): string {
    const n = d.targets.length;
    const one = d.targets[0]?.name;
    switch (d.appliesTo) {
        case "BUSINESS":
            return "everything";
        case "STOREFRONT":
            return n === 0
                ? "no location"
                : n === 1 && one
                  ? `at ${one}`
                  : `at ${n} locations`;
        case "COLLECTION":
            return n === 0
                ? "no category"
                : n === 1 && one
                  ? `${one}`
                  : `${n} categories`;
        case "PRODUCT":
            return n === 0
                ? "no product"
                : n === 1 && one
                  ? `${one}`
                  : `${n} products`;
    }
}

/** The line under a code: "15% off · everything · capped at 100". */
export function describeDiscount(d: Discount): string {
    return [
        ruleOf(d),
        reachOf(d),
        d.usageLimit === null ? "no cap" : `capped at ${d.usageLimit}`,
    ].join(" · ");
}

/** "₹2,100" off across its orders; null before anyone used it. */
export function gaveOffOf(d: Pick<Discount, "used" | "usage">): string | null {
    if (!d.usage || d.used === 0) return null;
    return formatMoneyMajor(d.usage.gaveOff, d.usage.currency);
}

/**
 * A code read first (DEC-267): "Used on 14 orders · ₹2,100 off", or "Not
 * used yet"; and "₹18,400 in those orders" when the read carries it.
 */
export function usageWords(d: Pick<Discount, "used" | "usage">): {
    lead: string;
    orders: string | null;
} {
    const off = gaveOffOf(d);
    if (!off) return { lead: "Not used yet", orders: null };
    const total = d.usage?.ordersTotal;
    return {
        lead: `Used on ${count(d.used, "order")} · ${off} off`,
        orders:
            total === undefined
                ? null
                : `${formatMoneyMajor(total, d.usage?.currency)} in those orders`,
    };
}
