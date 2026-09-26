import { formatMoneyMajor } from "@/lib/format/money";

import type { Discount } from "./service";

/** "15% off", "₹10.00 off". */
export function ruleOf(
    d: Pick<Discount, "kind" | "percent" | "amount" | "currency">,
): string {
    if (d.kind === "PERCENTAGE") return `${d.percent ?? "?"}% off`;
    return `${formatMoneyMajor(d.amount ?? "0", d.currency ?? "") ?? d.amount} off`;
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
                ? "no storefront"
                : n === 1 && one
                  ? `at ${one}`
                  : `at ${n} storefronts`;
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
