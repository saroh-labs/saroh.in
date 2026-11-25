import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { locationsServer, mayReadLocations } from "@/lib/stores/access";

/** Sell › Locations: the business's locations (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(locationsServer, mayReadLocations);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
