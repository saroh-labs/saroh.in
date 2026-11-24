import { mayReadProducts, productServer } from "@/lib/products/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** One product's page (DEC-259); another business's product is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(productServer, mayReadProducts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
