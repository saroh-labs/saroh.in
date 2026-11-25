import { collectionsServer } from "@/lib/collections/access";
import { mayReadProducts } from "@/lib/products/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Every collection (DEC-259), to whoever may open Products while Sell is on. */
export const dynamic = "force-dynamic";
export const GET = readRoute(collectionsServer, mayReadProducts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
