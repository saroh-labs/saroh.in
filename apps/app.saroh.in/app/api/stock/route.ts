import { mayReadProducts } from "@/lib/products/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { stockLevelsServer } from "@/lib/stock/access";

/** Stock levels: a page of them, or every shelf (DEC-259), to whoever may open Products while Sell is on. */
export const dynamic = "force-dynamic";
export const GET = readRoute(stockLevelsServer, mayReadProducts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
