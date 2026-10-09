import { limitWordsFor } from "@saroh/pricing-catalog";

import type { BillingAccessView } from "./access";
import { accessRow, upgradeHref } from "./access";

/**
 * A hard limit as the screen it bites shows it BEFORE the work (UX-036):
 * "4 of 10 products", and — at the limit — why the create button is off
 * and the way to more. Pure, from the access read; every figure is the
 * API's.
 *
 * Null when nothing would stop the business: limits not enforced, a
 * business the catalogue doesn't reach, a row with no cap, a soft cap, or a
 * count the API couldn't give.
 */
export interface PlanMeter {
    used: number;
    limit: number;
    /** How many more fit; 0 at or past the limit. */
    room: number;
    full: boolean;
    /** "4 of 10 products". */
    label: string;
    /** At the limit: "Your plan holds 10 products. You can't add more." */
    reason: string | null;
    /** Where "Upgrade" goes. */
    href: string;
    /** The plan with more, by name; null when there is none. */
    upgradeTo: string | null;
}

export function planMeter(
    view: BillingAccessView | null,
    moduleId: string,
): PlanMeter | null {
    if (view?.source !== "catalogue" || !view.enforced) return null;
    const row = accessRow(view, moduleId);
    if (row?.state !== "on" || row.soft === true) return null;
    if (row.limit === null || row.usage === null) return null;
    const what = limitWordsFor(moduleId)?.what ?? row.name.toLowerCase();
    const used = Math.max(0, Math.floor(row.usage));
    const full = used >= row.limit;
    return {
        used,
        limit: row.limit,
        room: Math.max(0, row.limit - used),
        full,
        label: `${used} of ${row.limit} ${what}`,
        reason: full
            ? `Your plan holds ${row.limit} ${what}. ${
                  limitWordsFor(moduleId)?.paused ?? "You can't add more."
              }`
            : null,
        href: upgradeHref(row.upgradeTo?.planId),
        upgradeTo: row.upgradeTo?.name ?? null,
    };
}

/**
 * What the header beside the create button says of the limit (#874): the
 * count and Upgrade, unless the screen's limit banner (`PlanLimitNotice`,
 * from 80%) already says it — then once is enough, and the banner, with its
 * words and its way up, is the one kept. The create button stays off at the
 * limit either way.
 */
export function meterBeside(
    meter: PlanMeter | null,
    bannerShown: boolean,
): { label: string | null; upgrade: boolean } {
    if (!meter || bannerShown) return { label: null, upgrade: false };
    return { label: meter.label, upgrade: meter.full };
}

/**
 * What an import of `rows` new things can bring in under the limit
 * (UX-036): all of them, or the first `fits` — said before the import, not
 * refused after it. Null when nothing limits it.
 */
export function importRoom(
    meter: PlanMeter | null,
    rows: number,
): { fits: number; over: boolean; words: string | null } | null {
    if (!meter) return null;
    const fits = Math.min(rows, meter.room);
    if (fits >= rows) return { fits, over: false, words: null };
    const what = meter.label.replace(/^\d+ of \d+ /, "");
    return {
        fits,
        over: true,
        words:
            fits === 0
                ? `Your plan holds ${meter.limit} ${what}, and you have ${meter.used}, so none of these ${rows} can come in.`
                : `Your plan holds ${meter.limit} ${what}. You have ${meter.used}, so ${fits} of these ${rows} can come in.`,
    };
}
