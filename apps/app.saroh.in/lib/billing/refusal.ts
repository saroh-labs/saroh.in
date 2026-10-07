import { formatInr } from "@saroh/pricing-catalog";

import type { UpgradeTo } from "./access";

/**
 * A write the business's plan refused (plans catalogue U13), as the screen
 * shows it (U14): the notice, never the raw message in a toast.
 *
 * - `PLAN_LIMIT_REACHED` (403) carries the design's 100% notice ready to show
 *   (`details.notice`) and where more is (`details.upgradeTo`).
 * - `MODULE_LOCKED` (403) says the row is off on this plan; its message is
 *   the title, and `upgradeTo` the way up.
 */
export interface PlanRefusal {
    code: "PLAN_LIMIT_REACHED" | "MODULE_LOCKED";
    title: string;
    body: string;
    cta: string;
    upgradeTo: UpgradeTo | null;
    /** The limit and use, for the bar; null on a lock. */
    limit: number | null;
    used: number | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function upgradeOf(v: unknown): UpgradeTo | null {
    if (!isRecord(v)) return null;
    const { planId, name, pricePaise } = v;
    return typeof planId === "string" &&
        typeof name === "string" &&
        typeof pricePaise === "number" &&
        Number.isSafeInteger(pricePaise)
        ? { planId, name, pricePaise }
        : null;
}

function text(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null;
}

/**
 * The refusal in an error's `details`, or null when it isn't one. `message`
 * is the envelope's, the title of a lock.
 */
export function planRefusalOf(
    details: unknown,
    message: unknown,
): PlanRefusal | null {
    if (!isRecord(details)) return null;
    const upgradeTo = upgradeOf(details.upgradeTo);
    if (details.code === "PLAN_LIMIT_REACHED") {
        const notice = isRecord(details.notice) ? details.notice : {};
        const title = text(notice.title) ?? text(message);
        if (!title) return null;
        return {
            code: "PLAN_LIMIT_REACHED",
            title,
            body: text(notice.body) ?? "",
            cta:
                text(notice.cta) ?? (upgradeTo ? "See plans" : "See your plan"),
            upgradeTo,
            limit: typeof details.limit === "number" ? details.limit : null,
            used: typeof details.used === "number" ? details.used : null,
        };
    }
    if (details.code === "MODULE_LOCKED") {
        const title = text(message);
        if (!title) return null;
        return {
            code: "MODULE_LOCKED",
            title,
            body: upgradeTo
                ? `${upgradeTo.name} is ${formatInr(upgradeTo.pricePaise)} a month + GST. Nothing you've made is lost; it's here when you upgrade.`
                : "Nothing you've made is lost.",
            cta: upgradeTo ? `See ${upgradeTo.name}` : "See plans",
            upgradeTo,
            limit: null,
            used: null,
        };
    }
    return null;
}
