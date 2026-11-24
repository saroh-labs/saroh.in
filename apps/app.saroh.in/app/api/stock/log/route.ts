import { mayReadProducts } from "@/lib/products/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { stockLogServer } from "@/lib/stock/access";

/** The stock log, a page at a time or a product's latest (DEC-259), to whoever may open Products while Sell is on. */
export const dynamic = "force-dynamic";
export const GET = readRoute(stockLogServer, mayReadProducts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
