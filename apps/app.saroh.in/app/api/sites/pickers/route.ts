import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { maySiteRead, pickerServer } from "@/lib/sites/access";

/** The site editor's pickers (DEC-259, U33), to whoever may read the site; the API decides the rest. */
export const dynamic = "force-dynamic";
export const GET = readRoute(pickerServer, maySiteRead);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
