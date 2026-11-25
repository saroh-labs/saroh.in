import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, siteFrameServer } from "@/lib/sites/access";

/** The site header over every Website tab (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(siteFrameServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
