import { redirect } from "next/navigation";

import { PLANS_HREF } from "@/components/settings/plan-billing/styles";
import { SettingsTabScreen } from "@/components/settings/settings-tab-screen";
import { BillingView } from "@/components/settings/tabs/billing-tab";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { mayReadBilling } from "@/lib/saroh-billing/screen-service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Plan and billing (plans catalogue U14; laid out as the owner
 * asked on 13 and 14 Oct 2026): one status line (the plan this business is
 * on and what happens next) with at most one message under it, then ONLY
 * the plan it is on, as one card with a button to the next screen where
 * every plan is (`./plans`, "Change plan"). Then "How billing works" for
 * what is true and asks nothing, add-ons, and Saroh's invoices to it. The
 * coupon is used when a plan is changed, so it is on the next screen.
 *
 * Opened by whoever the API reads it to (`billing:read`: Owner and Admin
 * by default), and changed by the Owner alone (`billing:manage`, DEC-131
 * amended 2026-10-11). The tab (`SETTINGS_PAGES`), this page and every plan
 * prompt ask the same two (`lib/billing/plan-access.ts`), so none sends a
 * person to a page that turns them away. Someone who may read but not
 * change (an Admin) sees the plan and the invoices with no button to press,
 * that only the owner can, and a link to read Saroh's plans.
 *
 * Who Saroh bills (DEC-167, U5) is the owner's alone: its row is read and
 * drawn only for whoever may change the plan, and an Admin sees nothing of
 * a billing profile (R2, AE6).
 *
 * Reads degrade per source: the plan and access are the page (a failure is
 * the section's boundary); the price list, invoices, add-ons and checkouts
 * each say when they couldn't be read, and the rest still shows.
 *
 * A link to a plan's change made before the plans had their own screen
 * (`?plan=&cycle=`, `#change-plan`) is sent on to it.
 *
 * Not found while plans aren't shown (DEC-136): the segment's layout
 * answers first.
 *
 * On React Query (DEC-259): the page checks the session and moves an old
 * link on; what the tab draws (`/api/settings/billing`,
 * `lib/saroh-billing/screen-service.ts`) loads in the browser, drawn by
 * `SettingsTabScreen`. Whoever may not open the plan is told so here, from
 * the same gate as the read route (`mayReadBilling`): the route's 403 would
 * only draw a generic denial.
 */
// Always named. While plans aren't shown the address is not-found, and
// the not-found page's own title replaces this one; a tab never falls back
// to the bare "Saroh".
export const metadata = { title: "Plan and billing · Settings" };

export default async function PlanBillingPage({
    searchParams,
}: {
    searchParams?: Promise<{
        plan?: string | string[];
        cycle?: string | string[];
    }>;
} = {}) {
    await requireSession();
    // Where every "Upgrade" used to land: the plan's change opens on the
    // next screen now. Not kept by a browser: it is the address that moved.
    const query = (await searchParams) ?? {};
    if (typeof query.plan === "string" && query.plan) {
        const on = new URLSearchParams({ plan: query.plan });
        if (typeof query.cycle === "string") on.set("cycle", query.cycle);
        redirect(`${PLANS_HREF}?${on.toString()}`);
    }
    const org = await activeOrganizationOnce();
    // Unknown (no business resolved) opens, and the API decides.
    if (org && !(await mayReadBilling())) {
        return <BillingView screen={{ kind: "denied" }} />;
    }
    return (
        <SettingsTabScreen tab="/settings/billing" kind={org?.kind ?? null} />
    );
}
