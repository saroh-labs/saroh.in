import { mayReadProducts } from "@/lib/products/access";
import { categoriesServer } from "@/lib/products/settings-access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The business's categories (DEC-259), to whoever may open Products while Sell is on. */
export const dynamic = "force-dynamic";
export const GET = readRoute(categoriesServer, mayReadProducts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
