import type { ReactNode } from "react";

import { PaymentsLocked } from "@/components/invoices/locked/payments-locked";
import { mayRead, paymentsLockedCopy } from "@/lib/invoices/access";
import { InvoiceSaveProvider } from "@/lib/invoices/use-invoices";
import { resolveActiveOrganization } from "@/lib/organizations/service";

/**
 * Permission gate for Billing → Invoices (ADR-007). Invoicing needs no
 * module (DEC-070): a business bills, sends and records paid with Payments
 * off, so the gate is the read, not `ModuleGate`. A deep link reaches these
 * routes whatever the rail shows, so it sits here once for every nested
 * route; a role without the read gets the design's locked card (D18), not
 * the generic denial.
 *
 * With no organization to read, the API decides, as the pages do.
 *
 * On React Query (DEC-259): every write under it, the editor's too, goes
 * as the tab's business and reads Invoices' queries again
 * (`InvoiceSaveProvider`).
 */
export default async function Layout({ children }: { children: ReactNode }) {
    const organization = await resolveActiveOrganization().catch(() => null);
    if (organization && !mayRead(organization, "invoice:read")) {
        return (
            <PaymentsLocked {...paymentsLockedCopy(organization, "invoices")} />
        );
    }
    return <InvoiceSaveProvider>{children}</InvoiceSaveProvider>;
}
