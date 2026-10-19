import { StatCard } from "@saroh/ui/stat-card";

import { EmptyPanel } from "@/components/states/empty-panel";

/** The words both places show until the commission work lands. */
export const PAYOUTS_PENDING = "Payouts arrive with the commission work";

/**
 * Where the Team screen's money goes (DEC-169), until the commission work
 * (admin console U21: `PayoutsTab`, `EarningsCard`) is merged. Then this
 * file's two uses are swapped for those components, and nothing else on
 * the screen changes.
 *
 * The contract:
 *
 * - `place="tab"`: the whole Payouts tab body (`app/team/(tabs)/payouts`).
 *   U21's `PayoutsTab` goes here.
 * - `place="summary"`: one card in the Teammates tab's summary row, beside
 *   People, Account managers and Businesses without a manager. U21's
 *   `EarningsCard` (this month's commission) goes here.
 *
 * The caller renders it only for staff with `team:pay` (Platform owner and
 * Billing); the slot itself reads nothing and decides nothing. It never
 * shows an amount or a rate: rates live in the database, never in code.
 */
export function PayoutsSlot({ place }: { place: "tab" | "summary" }) {
    if (place === "summary") {
        return (
            <StatCard
                data-payouts-slot="summary"
                label="Commission this month"
                value="—"
                hint={`${PAYOUTS_PENDING}.`}
            />
        );
    }
    return (
        <div data-payouts-slot="tab">
            <EmptyPanel
                title={PAYOUTS_PENDING}
                description="What each teammate has earned, their monthly statements and Mark paid will be here. Only Platform owner and Billing see this tab."
            />
        </div>
    );
}
