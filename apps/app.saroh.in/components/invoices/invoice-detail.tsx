"use client";

import { useRouter } from "next/navigation";

import { InvoiceDetailsView } from "@/components/invoices/details/invoice-details-view";
import type { InvoiceDetails } from "@/lib/invoices/details";

/**
 * One invoice's page, `/billing/invoices/[id]` (DEC-173, U9 #1121,
 * INVPageA): the details view the list's side sheet draws, as a page, so a
 * deep link, Home and a customer's invoices open the same thing. A write
 * reads the page again; a deleted draft goes back to the list.
 */
export function InvoiceDetail({ details }: { details: InvoiceDetails }) {
    const router = useRouter();
    return (
        <InvoiceDetailsView
            details={details}
            layout="page"
            onChanged={() => router.refresh()}
        />
    );
}
