import { invoiceServer, mayReadInvoices } from "@/lib/invoices/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** One invoice's details (DEC-259); another business's invoice is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(invoiceServer, mayReadInvoices);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
