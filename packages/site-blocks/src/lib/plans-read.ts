import type { AutopayMethod } from "../autopay/api";
import { autopayMethodsOf } from "../autopay/api";

/**
 * Reading the public plans answer (G9, G20), in a module with no "use
 * client" directive: saroh.app's server calls these for the Plans block's
 * feed. Exported from the Plans block's own (client) module they were only
 * client references on the server, the call threw, and a live or preview
 * page holding a Plans section failed to load.
 */

/** A plan as the public plans read serves it. */
export interface PublicPlan {
    id: string;
    name: string;
    description: string | null;
    /** A decimal string, e.g. "1200.00". */
    price: string;
    currency: string;
    /** WEEK | MONTH | QUARTER | YEAR */
    interval: string;
    /** The one plan more current members are on than any other. */
    mostChosen: boolean;
}

export function isPublicPlan(value: unknown): value is PublicPlan {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        (v.description === null || typeof v.description === "string") &&
        typeof v.price === "string" &&
        typeof v.currency === "string" &&
        typeof v.interval === "string" &&
        typeof v.mostChosen === "boolean"
    );
}

/** The plans in a read's body, narrowed rather than cast (#264); else null. */
export function plansOf(body: unknown): PublicPlan[] | null {
    const rows = (body as { plans?: unknown } | null)?.plans;
    if (!Array.isArray(rows)) return null;
    return rows.filter(isPublicPlan);
}

/** Whether a read says Join works (G20); an older API that doesn't say: no. */
export function plansPayOnline(body: unknown): boolean {
    return (
        (body as { payOnline?: unknown } | null)?.payOnline === true &&
        !plansNotTakingOrders(body)
    );
}

/**
 * Whether the read says the business isn't taking orders on this site
 * (#800: a website past its plan's limit). Only an explicit `true`.
 */
export function plansNotTakingOrders(body: unknown): boolean {
    return (
        (body as { notTakingOrders?: unknown } | null)?.notTakingOrders === true
    );
}

/**
 * Whether the business's Saroh plan includes memberships (6 Oct 2026). Only
 * an explicit `offered: false` says no: an older API that doesn't say, yes.
 * When no, the read's plans are empty whatever is on sale.
 */
export function plansOffered(body: unknown): boolean {
    return (body as { offered?: unknown } | null)?.offered !== false;
}

/** The autopay methods the plans read names (D12); none when it names none. */
export function plansAutopayMethods(body: unknown): AutopayMethod[] {
    return autopayMethodsOf(
        (body as { autopayMethods?: unknown } | null)?.autopayMethods,
    );
}
