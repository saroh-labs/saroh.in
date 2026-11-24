import {
    invoicesSummaryServer,
    mayReadInvoices,
} from "@/lib/invoices/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The Invoices money strip (DEC-259): read beside the list, so a payment moves both. */
export const dynamic = "force-dynamic";
export const GET = readRoute(invoicesSummaryServer, mayReadInvoices);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
