import type {
    EarningsSummary,
    PayoutStatement,
    RatesView,
} from "./commission-words";
import { getJson } from "./control-plane";

/**
 * Commission as the console reads it (DEC-169, admin console U21).
 * Server-only: it reads through `control-plane.ts`. Each answers `null`
 * when the caller may not see it (403): the screen then leaves it out.
 *
 * The Team page (U17) mounts `PayoutsTab` with `readPayouts` (and
 * `readRates` for a holder of `commission:rates`); a member's page (U22)
 * mounts `EarningsCard` with `readEarnings`.
 */

/** A month's statement for the team; this month in India when left out. */
export function readPayouts(
    month?: string | null,
): Promise<PayoutStatement | null> {
    const suffix = month ? `?month=${encodeURIComponent(month)}` : "";
    return getJson<PayoutStatement>(`/team/payouts${suffix}`);
}

/** One teammate's earnings: waiting, due and paid, by month. */
export function readEarnings(
    platformAdminId: string,
): Promise<EarningsSummary | null> {
    return getJson<EarningsSummary>(
        `/staff/${encodeURIComponent(platformAdminId)}/earnings`,
    );
}

/** The commission rates in force, to come and ever set. */
export function readRates(): Promise<RatesView | null> {
    return getJson<RatesView>("/commission/rates");
}
