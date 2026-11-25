import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { formEntriesServer, mayReadSiteForms } from "@/lib/sites/access";

/** A form's entries (DEC-259), to whoever may read the site and its forms. */
export const dynamic = "force-dynamic";
export const GET = readRoute(formEntriesServer, mayReadSiteForms);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
