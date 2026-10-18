import { PermissionDeniedState } from "@saroh/ui/data-state";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { readView } from "@/lib/business-page";
import type { BusinessView } from "@/lib/businesses";
import { can } from "@/lib/console";
import type { StaffIdentity } from "@/lib/control-plane";

import { OpenAccessCard } from "./open-access";

/**
 * Without `organization:view-as`: the no-access panel, inside the tab
 * (admin plan U6, R16: what it needs, and what the rest of the page still
 * shows).
 */
export function NeedsSupportRole() {
    return (
        <PermissionDeniedState
            title="This part needs support access"
            description="It shows the business's own details. Your access covers its Overview and Modules, not those."
            note="A Platform owner can add the Support role to your access."
        />
    );
}

/**
 * A tab whose panels read the business's own details (admin plan U2, R10):
 * the no-access panel for staff without `organization:view-as`, the Open
 * support access card while no session is open, and the tab itself once
 * one is. Each is drawn inside the tab, so the header and the other tabs
 * stand either way.
 */
export async function SessionTab({
    staff,
    organizationId,
    children,
}: {
    staff: StaffIdentity;
    organizationId: string;
    children: (view: BusinessView) => ReactNode;
}) {
    if (!can(staff, "organization:view-as")) return <NeedsSupportRole />;
    const result = await readView(organizationId);
    if (result.status === "not-found") notFound();
    if (result.status === "needs-access")
        return <OpenAccessCard organizationId={organizationId} />;
    return <>{children(result.view)}</>;
}
