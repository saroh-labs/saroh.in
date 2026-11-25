import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, siteLinksServer } from "@/lib/sites/access";

/** Reach › Links and sharing (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(siteLinksServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
