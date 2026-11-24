import {
    customersListServer,
    mayReadCustomers,
} from "@/lib/customers/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** A page of the customers list (DEC-259); what each row shows is the API's for this person. */
export const dynamic = "force-dynamic";
export const GET = readRoute(customersListServer, mayReadCustomers);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
