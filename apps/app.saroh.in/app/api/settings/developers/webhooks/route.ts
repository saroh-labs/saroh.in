import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadWebhooks, webhooksServer } from "@/lib/webhooks/access";

/** API and AI apps › Notifications to your systems: addresses, never a secret, to webhook:manage (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(webhooksServer, mayReadWebhooks);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
