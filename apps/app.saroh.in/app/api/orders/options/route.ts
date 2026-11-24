import { mayReadOrders, ordersOptionsServer } from "@/lib/orders/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** What the Orders filter bar offers, and the open counts per storefront (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(ordersOptionsServer, mayReadOrders);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
