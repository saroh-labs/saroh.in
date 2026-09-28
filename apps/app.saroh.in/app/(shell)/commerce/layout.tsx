import type { ReactNode } from "react";

import {
    OrderLocked,
    OrdersLocked,
} from "@/components/commerce/orders/orders-states";
import { SellDenied } from "@/components/commerce/orders/sell-denied";
import { ModuleGate } from "@/components/modules/module-gate";
import { PageContainer } from "@/components/shared/page-container";
import {
    orderLockedText,
    ordersAccess,
    ordersLockedCopy,
} from "@/lib/orders/access";
import { resolveActiveOrganization } from "@/lib/organizations/service";

/**
 * Capability gate for this section (#117, §21).
 *
 * The sidebar already hides COMMERCE when it is off, but hiding a nav item is
 * not enforcement — a bookmark or a pasted link reaches these routes directly.
 * Gating at the layout covers every nested route, including deep links to a
 * detail page, with one check.
 *
 * A role Sell is out of reach for (a Reviewer) sees Orders' own locked card
 * on Orders and one order, not the generic denial (DEC-056).
 */
export default function Layout({ children }: { children: ReactNode }) {
    return (
        <ModuleGate moduleKey="COMMERCE" denied={sellDenied}>
            {children}
        </ModuleGate>
    );
}

async function sellDenied(standard: ReactNode): Promise<ReactNode> {
    const organization = await resolveActiveOrganization().catch(() => null);
    // Orders is open to them after all (a role that stages orders): the
    // gate's denial stands — nothing here would be truer.
    if (!organization || ordersAccess(organization).open) return standard;
    return (
        <SellDenied
            standard={standard}
            orders={
                <PageContainer width="full">
                    <OrdersLocked
                        {...ordersLockedCopy(organization, organization.name)}
                    />
                </PageContainer>
            }
            order={<OrderLocked text={orderLockedText(organization)} />}
        />
    );
}
