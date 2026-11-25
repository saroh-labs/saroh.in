import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadSiteForms, siteFormsServer } from "@/lib/sites/access";

/** A site's forms, to whoever may read forms too (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(siteFormsServer, mayReadSiteForms);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
