import {
    customerServer,
    mayReadCustomers,
} from "@/lib/customers/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** One customer's page (DEC-259); another business's contact is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(customerServer, mayReadCustomers);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
