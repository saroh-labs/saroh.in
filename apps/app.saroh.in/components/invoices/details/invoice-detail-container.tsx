"use client";

import type { InvoiceAsk } from "@/lib/invoices/queries";
import { useInvoice } from "@/lib/invoices/use-invoices";

import { InvoiceDetail } from "./invoice-detail";

/**
 * One invoice's page on React Query (DEC-259): the same `InvoiceDetail`,
 * drawn from the invoice's query, which a write reads again
 * (`useInvoiceSave`).
 */
export function InvoiceDetailContainer({ ask }: { ask: InvoiceAsk }) {
    const read = useInvoice(ask);
    // A failed read is the page failing (`error.tsx`).
    if (read.isError && !read.data) throw read.error;
    if (!read.data) return null;
    return <InvoiceDetail details={read.data} />;
}
