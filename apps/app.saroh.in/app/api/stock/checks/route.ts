import { mayReadProducts } from "@/lib/products/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { stockChecksServer } from "@/lib/stock/access";

/** The stock checks, a page at a time or every open one (DEC-259), to whoever may open Products while Sell is on. */
export const dynamic = "force-dynamic";
export const GET = readRoute(stockChecksServer, mayReadProducts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
