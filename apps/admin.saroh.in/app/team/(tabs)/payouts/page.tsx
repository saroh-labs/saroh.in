import { NoAccessPanel } from "@/components/not-authorized";
import { PayoutsSlot } from "@/components/team/payouts-slot";
import { can, requireStaff } from "@/lib/console";

export const metadata = { title: "Payouts" };

/**
 * Payouts (R30): what the team has earned and Mark paid, for `team:pay`
 * only (Platform owner and Billing). Until the commission work lands it
 * is the payouts slot's placeholder. Without `team:pay` the tab isn't in
 * the strip, and this address shows the no-access panel.
 */
export default async function PayoutsPage() {
    const gate = await requireStaff("team:read");
    if (!gate.ok) return null;
    const { staff } = gate;
    if (!can(staff, "team:pay")) return <NoAccessPanel email={staff.email} />;
    return <PayoutsSlot place="tab" />;
}
