import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, sitePagesServer } from "@/lib/sites/access";

/** A site's Pages: the pages tree, its health and old links (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(sitePagesServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
