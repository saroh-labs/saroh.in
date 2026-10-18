import { PermissionDeniedState } from "@saroh/ui/data-state";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { readView } from "@/lib/business-page";
import type { BusinessView } from "@/lib/businesses";
import { can } from "@/lib/console";
import type { StaffIdentity } from "@/lib/control-plane";

import { OpenAccessCard } from "./open-access";

/**
 * Without `organization:view-as`: the no-access panel, inside the tab, in
 * the words the page used before it had tabs.
 */
export function NeedsSupportRole() {
    return (
        <PermissionDeniedState
            title="Opening a business needs support access"
            description="Your access covers the directory, not a business's own details."
            note="A Platform Owner can add the Support role to your access."
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
