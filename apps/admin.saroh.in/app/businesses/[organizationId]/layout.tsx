import { PageContainer } from "@saroh/ui/page-container";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import { BusinessHeader } from "@/components/business/business-header";
import {
    businessGate,
    readAccessUntil,
    readOverview,
    readSummary,
    readView,
} from "@/lib/business-page";
import { can } from "@/lib/console";
import { overviewBadges } from "@/lib/overview-words";

/**
 * A business's page (admin plan U2): the header and the tabs over each
 * tab's own address. It stands on the directory row (`organization:read`),
 * so it draws without a support session; a tab whose panels need one asks
 * for it inside the tab.
 */
export default async function BusinessLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ organizationId: string }>;
}) {
    const gate = await businessGate();
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const { organizationId } = await params;

    const summary = await readSummary(organizationId);
    if (!summary) notFound();

    const canViewAs = can(staff, "organization:view-as");
    // Whether a session is open, and the hold's who and why, which only a
    // session can read. A failed read leaves the header standing; the tab
    // that needs it says so.
    const view = canViewAs
        ? await readView(organizationId).catch(() => null)
        : null;
    const open = view?.status === "ok";
    const until = open ? await readAccessUntil(organizationId) : null;
    // The tabs' counts and "needs you" (U3): from the Overview's read, made
    // once per request with the tab's. A failed read leaves them off.
    const overview = await readOverview(organizationId).catch(() => null);

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <BusinessHeader
                    summary={summary}
                    hold={open ? (view.view.facts.legalHold ?? null) : null}
                    session={open ? "open" : "closed"}
                    sessionUntil={until}
                    canViewAs={canViewAs}
                    canLifecycle={can(staff, "organization:lifecycle:write")}
                    canLiftHold={can(staff, "organization:legal-hold:lift")}
                    canOffer={
                        can(staff, "pricing:override") ||
                        can(staff, "subscription:override")
                    }
                    canTakeAway={
                        staff.roles.includes("PLATFORM_OWNER") &&
                        can(staff, "pricing:override")
                    }
                    badges={overviewBadges(overview?.badges)}
                />
                {children}
            </PageContainer>
        </AdminShell>
    );
}
