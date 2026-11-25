import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayCreateSite, newSiteServer } from "@/lib/sites/access";

/** New site's reads (DEC-259), to whoever may make a site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(newSiteServer, mayCreateSite);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
