import { dataExportsServer, mayReadData } from "@/lib/data-export/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Settings › Your data: the owner's downloads, never a download link (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(dataExportsServer, mayReadData);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
