import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, siteTrackingServer } from "@/lib/sites/access";

/** A site's Search and tracking (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(siteTrackingServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
