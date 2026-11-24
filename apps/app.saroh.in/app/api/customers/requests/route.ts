import {
    customerRequestsServer,
    mayReadCustomerRequests,
} from "@/lib/customers/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Customers' removal requests (DEC-172, DEC-259): `customer:remove` only. */
export const dynamic = "force-dynamic";
export const GET = readRoute(customerRequestsServer, mayReadCustomerRequests);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
