import { homeServer } from "@/lib/home/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Home's aggregate (DEC-259); the API shapes it by role. */
export const dynamic = "force-dynamic";
export const GET = readRoute(homeServer);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
