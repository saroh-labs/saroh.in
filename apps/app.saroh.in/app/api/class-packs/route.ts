import { mayReadPacks, packsListServer } from "@/lib/class-packs/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Bookings › Packs: every pack with its notes (DEC-259), to whoever may read packs while Class packs is on. */
export const dynamic = "force-dynamic";
export const GET = readRoute(packsListServer, mayReadPacks);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
