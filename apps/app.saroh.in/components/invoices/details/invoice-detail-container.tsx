"use client";

import { PageContainer } from "@saroh/ui/page-container";
import type { ReactNode } from "react";

import type { InvoiceAsk } from "@/lib/invoices/queries";
import { useInvoice } from "@/lib/invoices/use-invoices";

import { InvoiceDetail } from "./invoice-detail";

/**
 * One invoice's page on React Query (DEC-259): the same `InvoiceDetail`,
 * drawn from the invoice's query, which a write reads again
 * (`useInvoiceSave`). Read in the browser, behind the route's loader.
 */
export function InvoiceDetailContainer({
    ask,
    skeleton,
}: {
    ask: InvoiceAsk;
    /** The route's loader, until the invoice is read. */
    skeleton: ReactNode;
}) {
    const read = useInvoice(ask);
    // A failed read is the page failing (`error.tsx`).
    if (read.isError && !read.data) throw read.error;
    if (!read.data) return skeleton;
    return (
        <PageContainer width="full">
            <InvoiceDetail details={read.data} />
        </PageContainer>
    );
}
