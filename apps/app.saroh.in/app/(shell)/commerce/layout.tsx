import type { ReactNode } from "react";

import {
    OrderLocked,
    OrdersLocked,
} from "@/components/commerce/orders/orders-states";
import { SellDenied } from "@/components/commerce/orders/sell-denied";
import { ModuleGate } from "@/components/modules/gate/module-gate";
import { CustomersOutsideSell } from "@/components/shared/navigation/customers-outside-sell";
import { PAYING_MODULES } from "@/components/shared/navigation/nav-items";
import { PageContainer } from "@/components/shared/page/page-container";
import { modulesOrUnknown } from "@/lib/modules/guard";
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
 *
 * Customers is the exception (DEC-264): a business that takes money
 * another way reaches it with Sell off.
 */
export default async function Layout({ children }: { children: ReactNode }) {
    const gated = (
        <ModuleGate moduleKey="COMMERCE" denied={sellDenied}>
            {children}
        </ModuleGate>
    );
    return (await customersWithoutSell()) ? (
        <CustomersOutsideSell gated={gated}>{children}</CustomersOutsideSell>
    ) : (
        gated
    );
}

/**
 * Sell is off (or out of reach) and another way of taking money is on:
 * Customers opens without it (DEC-264). Unknown availability leaves the
 * gate as it was, which lets the page through anyway.
 */
async function customersWithoutSell(): Promise<boolean> {
    const modules = await modulesOrUnknown();
    if (!modules) return false;
    const on = (key: string) =>
        modules.some((m) => m.key === key && m.readiness !== "DISABLED");
    return !on("COMMERCE") && PAYING_MODULES.some(on);
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
