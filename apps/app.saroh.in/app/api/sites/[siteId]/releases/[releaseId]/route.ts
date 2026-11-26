import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, siteReleaseServer } from "@/lib/sites/access";

/** One test release (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(siteReleaseServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
