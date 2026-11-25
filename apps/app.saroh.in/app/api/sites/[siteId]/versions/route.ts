import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, siteVersionsServer } from "@/lib/sites/access";

/** A site's version history (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(siteVersionsServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
