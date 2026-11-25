import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { allSitesServer, maySiteRead } from "@/lib/sites/access";

/** All sites (DEC-259), to whoever may read the website. */
export const dynamic = "force-dynamic";
export const GET = readRoute(allSitesServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
