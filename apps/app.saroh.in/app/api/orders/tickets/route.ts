import { mayReadOrders, ticketsServer } from "@/lib/orders/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Print tickets (DEC-259): the orders picked on the list, as the quick view reads them. */
export const dynamic = "force-dynamic";
export const GET = readRoute(ticketsServer, mayReadOrders);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
