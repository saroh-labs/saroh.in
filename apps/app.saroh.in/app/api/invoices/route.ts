import {
    invoicesListServer,
    mayReadInvoices,
} from "@/lib/invoices/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The invoices list (DEC-259); what each invoice shows is the API's for this person. */
export const dynamic = "force-dynamic";
export const GET = readRoute(invoicesListServer, mayReadInvoices);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
