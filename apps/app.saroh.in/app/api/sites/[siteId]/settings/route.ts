import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, siteSettingsServer } from "@/lib/sites/access";

/** A site's Settings tab (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(siteSettingsServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
