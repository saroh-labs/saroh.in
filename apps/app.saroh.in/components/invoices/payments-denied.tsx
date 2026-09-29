import type { ReactNode } from "react";

import { PaymentsLocked } from "@/components/invoices/payments-locked";
import { paymentsLockedCopy } from "@/lib/invoices/access";
import { resolveActiveOrganization } from "@/lib/organizations/service";

/**
 * What Payments' gate shows a role the module is out of reach for (a
 * Member, a Reviewer): the locked card (D18), in place of the generic
 * denial — which stands only when the organization can't be read to name
 * the role.
 */
export async function paymentsDenied(standard: ReactNode): Promise<ReactNode> {
    const organization = await resolveActiveOrganization().catch(() => null);
    if (!organization) return standard;
    return <PaymentsLocked {...paymentsLockedCopy(organization)} />;
}
