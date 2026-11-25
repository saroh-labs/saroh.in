import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, siteVersionServer } from "@/lib/sites/access";

/** One past version (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(siteVersionServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
