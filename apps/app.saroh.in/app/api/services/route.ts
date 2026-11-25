import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import {
    mayReadServices,
    servicesListServer,
} from "@/lib/services/access-server";

/** The Services list (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(servicesListServer, mayReadServices);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
