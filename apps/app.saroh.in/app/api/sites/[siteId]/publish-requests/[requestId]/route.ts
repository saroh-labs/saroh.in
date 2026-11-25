import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, publishRequestServer } from "@/lib/sites/access";

/** An AI app's publish request (DEC-215); the API asks site:publish (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(publishRequestServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
