import { mayReadPacks, packServer } from "@/lib/class-packs/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** One pack's page (DEC-259); another business's pack is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(packServer, mayReadPacks);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
