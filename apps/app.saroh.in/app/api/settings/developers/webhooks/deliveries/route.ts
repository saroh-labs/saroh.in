import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import {
    mayReadWebhooks,
    webhookDeliveriesServer,
} from "@/lib/webhooks/access";

/** An address's latest messages, to webhook:manage: never the receiver's answer (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(webhookDeliveriesServer, mayReadWebhooks);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
