import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadServices, serviceServer } from "@/lib/services/access-server";

/** One service's page; another business's id is a 404 (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(serviceServer, mayReadServices);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
