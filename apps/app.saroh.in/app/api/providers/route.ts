import { mayReadProviders, providersServer } from "@/lib/providers/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Settings › Integrations: connections as their rows draw them, never a credential, to anyone in the business (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(providersServer, mayReadProviders);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
