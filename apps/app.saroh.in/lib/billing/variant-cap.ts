import { itemLimitNotice, limitWordsFor } from "@saroh/pricing-catalog";
import { planLabel } from "@saroh/ui/lib/state-copy";

import type { BillingAccessView } from "./access";
import { accessRow, upgradeHref } from "./access";

/** The catalogue row that caps a product's variants (DEC-158). */
export const VARIANTS_ROW = "variants";

/**
 * The plan's cap on how many variants ONE product may have (DEC-158), as
 * the product editor says it before the save, from the access read. Not a
 * count across the business: there is no "used X of Y" for it, only each
 * product's own list against the number.
 *
 * Null when nothing caps them: limits not enforced, a business the
 * catalogue doesn't reach, a version without the row, the row left out, or
 * no number in its cell. As the API's check (`item-limits.ts`); the API
 * still refuses the write and says why.
 */
export interface VariantCap {
    limit: number;
    /** The plan the business is on, by name. */
    plan: string;
    /** The plan with more, by name; null when there is none. */
    upgradeTo: string | null;
    /** That plan has no cap on variants. */
    uncapped: boolean;
    /** Where the way to more goes. */
    href: string;
}

export function variantCapOf(
    view: BillingAccessView | null,
): VariantCap | null {
    if (view?.source !== "catalogue" || !view.enforced) return null;
    const row = accessRow(view, VARIANTS_ROW);
    if (row?.state !== "on" || row.limit === null) return null;
    return {
        limit: row.limit,
        plan: view.plan?.name ?? "",
        upgradeTo: row.upgradeTo?.name ?? null,
        uncapped: row.upgradeTo?.uncapped === true,
        href: upgradeHref(row.upgradeTo?.planId),
    };
}

/** What the Variants list says where one more wouldn't fit. */
export interface VariantCapNote {
    /** The sentence, in the API refusal's own words (`itemLimitNotice`). */
    text: string;
    /** The link's label (`planLabel`), and where it goes. */
    cta: string;
    href: string;
}

/**
 * The note once a product's list holds as many variants as the plan
 * allows, or more: null while there is room. A product past the cap keeps
 * every variant and can still be edited; the note says so.
 */
export function variantCapNote(
    cap: VariantCap | null,
    count: number,
): VariantCapNote | null {
    if (!cap || count < cap.limit) return null;
    const words = limitWordsFor(VARIANTS_ROW);
    if (!words) return null;
    const notice = itemLimitNotice(
        {
            limit: cap.limit,
            plan: cap.plan,
            upgradeTo: cap.upgradeTo ?? "",
            upgradeUncapped: cap.uncapped,
        },
        count,
        words.what,
        words.paused,
    );
    if (!notice) return null;
    return {
        text: `${notice.title}. ${notice.body}`,
        cta: planLabel(cap.upgradeTo),
        href: cap.href,
    };
}
