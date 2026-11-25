import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, siteOverviewServer } from "@/lib/sites/access";

/** A site's Overview (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(siteOverviewServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
