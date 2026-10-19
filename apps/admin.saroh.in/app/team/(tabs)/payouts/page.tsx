import { NoAccessPanel } from "@/components/not-authorized";
import { FailedPanel } from "@/components/states/failed-panel";
import { PayoutsTab } from "@/components/team/payouts-tab";
import { readPayouts, readRates } from "@/lib/commission";
import { readMonth } from "@/lib/commission-words";
import { can, requireStaff } from "@/lib/console";
import { listTeam } from "@/lib/staff";

export const metadata = { title: "Payouts" };

/**
 * Payouts (R30, U21): one month's commission statement for the team and
 * Mark paid, for `team:pay` only (Platform owner and Billing); the rates
 * sheet for `commission:rates`. Without `team:pay` the tab isn't in the
 * strip, and this address shows the no-access panel.
 */
export default async function PayoutsPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    const gate = await requireStaff("team:read");
    if (!gate.ok) return null;
    const { staff } = gate;
    if (!can(staff, "team:pay")) return <NoAccessPanel email={staff.email} />;

    const month = readMonth((await searchParams).month);
    const [statement, rates, members] = await Promise.all([
        readPayouts(month),
        can(staff, "commission:rates")
            ? readRates().catch(() => null)
            : Promise.resolve(null),
        listTeam().catch(() => undefined),
    ]);
    if (!statement) return <FailedPanel things="the payouts" />;

    // Nobody marks their own commission paid; the API refuses it too.
    const me = members?.find((member) => member.userId === staff.userId);
    return (
        <PayoutsTab
            statement={statement}
            canMarkPaid
            viewerPlatformAdminId={me?.platformAdminId ?? null}
            rates={rates}
            basePath="/team/payouts"
        />
    );
}
