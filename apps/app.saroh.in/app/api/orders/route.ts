import { mayReadOrders, ordersListServer } from "@/lib/orders/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The orders list (DEC-259); what each row shows is the API's for this person. */
export const dynamic = "force-dynamic";
export const GET = readRoute(ordersListServer, mayReadOrders);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
