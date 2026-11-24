"use client";

import type { InvoiceDetails } from "@/lib/invoices/details";
import { useInvoiceSave } from "@/lib/invoices/use-invoices";
import { InvoiceDetailsView } from "./invoice-details-view";

/**
 * One invoice's page, `/billing/invoices/[id]` (DEC-173, U9 #1121,
 * INVPageA): the details view the list's side sheet draws, as a page, so a
 * deep link, Home and a customer's invoices open the same thing. A write
 * reads the invoice again; a deleted draft goes back to the list.
 */
export function InvoiceDetail({ details }: { details: InvoiceDetails }) {
    const { saved } = useInvoiceSave();
    return (
        <InvoiceDetailsView
            details={details}
            layout="page"
            onChanged={() => void saved()}
        />
    );
}
