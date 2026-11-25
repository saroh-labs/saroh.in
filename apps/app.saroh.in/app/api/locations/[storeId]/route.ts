import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { locationServer, mayReadLocations } from "@/lib/stores/access";

/** One location's page (DEC-259); another business's location is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(locationServer, mayReadLocations);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
