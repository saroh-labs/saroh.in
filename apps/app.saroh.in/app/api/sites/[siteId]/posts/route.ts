import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, sitePostsServer } from "@/lib/sites/access";

/** A site's posts, as Writing lists them (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(sitePostsServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
