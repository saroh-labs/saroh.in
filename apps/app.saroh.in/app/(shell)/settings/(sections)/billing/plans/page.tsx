import { notFound } from "next/navigation";

import {
    ChangePlanDenied,
    ChangePlanScreen,
} from "@/components/settings/plan-billing/change-plan-screen";
import { mayChangePlan, mayOpenPlan } from "@/lib/billing/plan-access";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { plansOpen } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

/**
 * Settings › Plan and billing › Change plan (owner, 14 Oct 2026): the next
 * screen from the plan the business is on, with every plan as a card side
 * by side (stacked on a phone), Monthly | Yearly when the catalogue offers
 * yearly, the coupon that goes with the next change, and the way to the
 * full comparison. Choosing a plan opens its quote (`ChangePlanDialog`);
 * once the change is made, or its payment started, the person is back on
 * Plan and billing, where the status line and the one message say how it
 * stands. `?plan=&cycle=` opens that plan's change straight away: it is
 * where every "Upgrade" in the app lands (`upgradeHref`).
 *
 * Opened by whoever may open Plan and billing (`billing:read`). Without
 * `billing:manage` it is read: the plans and what each is for, no button
 * and no coupon. A payment still waiting is said first, as on the page
 * before it, so nobody starts a second one.
 *
 * Not found while plans aren't shown (DEC-136): the section's layout
 * answers first, and the page says so too.
 *
 * On React Query (DEC-259): the page checks the session, the switch and the
 * role, and refuses a role without `billing:read` in its own words (the
 * route's 403 would only draw a generic denial, DEV_LEARNINGS 25 Nov); the
 * plans load in the browser (`/api/settings/billing/plans`). It is drawn in
 * a `SettingsPanel` either way.
 */
export const metadata = { title: "Change plan · Settings" };

export default async function ChangePlanPage() {
    if (!(await plansOpen())) notFound();
    await requireSession();
    const org = await activeOrganizationOnce();
    // Unknown (no business resolved) opens, and the API decides.
    const canChange = org === null || mayChangePlan(org);
    if (org !== null && !mayOpenPlan(org)) {
        return <ChangePlanDenied canChange={canChange} />;
    }
    return <ChangePlanScreen canChange={canChange} />;
}
