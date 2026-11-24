import { mayReadProducts, productsListServer } from "@/lib/products/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** A page of the catalogue (DEC-259), to whoever may open Products. */
export const dynamic = "force-dynamic";
export const GET = readRoute(productsListServer, mayReadProducts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
