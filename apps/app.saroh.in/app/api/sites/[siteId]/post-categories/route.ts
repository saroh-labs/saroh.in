import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, postCategoriesServer } from "@/lib/sites/access";

/** A site's post categories, for the Categories sheet (DEC-259), to whoever may read the site. */
export const dynamic = "force-dynamic";
export const GET = readRoute(postCategoriesServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
