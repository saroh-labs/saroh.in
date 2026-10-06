import { PageContainer } from "@saroh/ui/page-container";
import { Suspense } from "react";

import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { PlansFailed } from "@/components/plans/plans-failed";
import { PlansHeader } from "@/components/plans/plans-header";
import { PlansShell } from "@/components/plans/plans-shell";
import { PlansSkeleton } from "@/components/plans/plans-skeleton";
import { env } from "@/env";
import { can, requireStaff } from "@/lib/console";
import type { StaffIdentity } from "@/lib/control-plane";
import { getPricing, getPricingImpact, listCoupons } from "@/lib/pricing";
import type { PlansTab } from "@/lib/pricing-draft";
import { tabFrom } from "@/lib/pricing-draft";
import { instanceApps } from "@/lib/sibling-apps";

export const metadata = { title: "Plans & modules" };

/**
 * Plans & modules (plans catalogue U6, the design "Saroh Admin Plans v2"):
 * the pricing catalogue every business is billed and limited by, edited as
 * one shared draft and published as versions. This page reads; the shell
 * below holds the draft, and each tab (U7–U10) draws from it.
 *
 * The heading and chrome draw at once; the catalogue streams in behind a
 * skeleton, and a failed read is a failed state with Try again, never an
 * empty editor that could be saved over what is live.
 */
export default async function PlansPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string | string[] }>;
}) {
    const gate = await requireStaff("pricing:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const tab = tabFrom((await searchParams).tab);

    return (
        <AdminShell staff={staff}>
            <PageContainer width="full">
                <div className="grid min-w-0 gap-4">
                    <PlansHeader />
                    <Suspense fallback={<PlansSkeleton />}>
                        <PlansLoaded staff={staff} tab={tab} />
                    </Suspense>
                </div>
            </PageContainer>
        </AdminShell>
    );
}

async function PlansLoaded({
    staff,
    tab,
}: {
    staff: StaffIdentity;
    tab: PlansTab;
}) {
    const [pricing, coupons, instance] = await Promise.all([
        getPricing().catch(() => undefined),
        listCoupons().catch(() => null),
        instanceApps(),
    ]);
    if (pricing === undefined) return <PlansFailed />;
    // Refused after the gate let them in: their access changed mid-visit.
    if (pricing === null) return <NotAuthorized email={staff.email} />;
    const impact = pricing.draft
        ? await getPricingImpact().catch(() => null)
        : null;
    const siteUrl = (
        env.MARKETING_SITE_URL ??
        instance?.apps.find((app) => app.key === "website")?.href ??
        "https://www.saroh.in"
    ).replace(/\/+$/, "");

    return (
        <PlansShell
            tab={tab}
            impact={impact}
            data={{
                pricing,
                coupons,
                siteUrl,
                me: { userId: staff.userId, name: null, email: staff.email },
                access: {
                    canEdit: can(staff, "pricing:edit"),
                    canPublish: can(staff, "pricing:publish"),
                    canManageCoupons: can(staff, "coupons:manage"),
                },
            }}
        />
    );
}
