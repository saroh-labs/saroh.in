import { mayReadOrders, orderServer } from "@/lib/orders/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** One order's page (DEC-259); another business's order is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(orderServer, mayReadOrders);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
