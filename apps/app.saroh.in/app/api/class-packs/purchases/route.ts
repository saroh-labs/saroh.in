import {
    mayReadPacks,
    packPurchasesServer,
} from "@/lib/class-packs/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Who holds a pack (DEC-259), to whoever may read packs while Class packs is on. */
export const dynamic = "force-dynamic";
export const GET = readRoute(packPurchasesServer, mayReadPacks);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
