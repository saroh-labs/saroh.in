import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import {
    billingServer,
    mayReadBilling,
} from "@/lib/saroh-billing/screen-service";

/** Settings › Plan and billing: what the tab draws, to whoever may open the plan (billing:read) (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(billingServer, mayReadBilling);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
